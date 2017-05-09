class Miner extends Observable {
	constructor(minerAddress, blockchain, mempool) {
		super();
		this._blockchain = blockchain;
		this._mempool = mempool;

		// XXX Cleanup
		this._address = minerAddress || new Address();
		if (!minerAddress || !(minerAddress instanceof Address)) {
			console.warn('No miner address set');
		}

		this._worker = null;
		this._hashCount = 0;
		this._hashrate = 0;
		this._hashrateWorker = null;

	}


	static _createWorker() {
		return new WorkerBuilder()
			.add(BufferUtils)
			.add(SerialBuffer)
			.add(CryptoLib)
			.add(Crypto)
			.add(Primitive)
			.add(Hash)
			.add(BlockHeader)
			.main(Miner._worker)
			.build();
	}

	static _worker() {
		const self = this;
		self.onmessage = function(e) {
			console.log('Worker received message: ' + e.data);
			self.postMessage('Response: ' + e.data);
		};
	}



	// XXX Cleanup
	static configureSpeed(iterations) {
		Miner._iterations = iterations || 75;
	}

	startWork() {
		if (this.working) {
			console.warn('Miner already working');
			return;
		}

		// Listen to changes in the mempool which evicts invalid transactions
		// after every blockchain head change and then fires 'transactions-ready'
		// when the eviction process finishes. Restart work on the next block
		// with fresh transactions when this fires.
		this._mempool.on('transactions-ready', () => this._startWork());

		// Immediately start processing transactions when they come in.
		this._mempool.on('transaction-added', () => this._startWork());

		// Initialize hashrate computation.
		this._hashCount = 0;
		this._hashrateWorker = setInterval( () => this._updateHashrate(), 5000);

		// Tell listeners that we've started working.
		this.fire('start', this);

		// Kick off the mining process.
		//this._startWork();

		// XXX Test
		var blob = (window.URL ? URL : webkitURL).createObjectURL(Miner._createWorker(), {
			type: 'application/javascript; charset=utf-8'
		});

		console.log(blob);

		this._worker = new Worker(blob);
		this._worker.onmessage = e => console.log('Worker said: ' + e.data);
		this._worker.postMessage('test123');
	}

	async _startWork() {
		// XXX Needed as long as we cannot unregister from transactions-ready events.
		if (!this.working) {
			return;
		}

		if (this._worker) {
			clearTimeout(this._worker);
		}

		// Construct next block.
		const nextBlock = await this._getNextBlock();

		console.log('Miner starting work on prevHash=' + nextBlock.prevHash.toBase64() + ', accountsHash=' + nextBlock.accountsHash.toBase64() + ', difficulty=' + nextBlock.difficulty + ', transactionCount=' + nextBlock.transactionCount + ', hashrate=' + this._hashrate + ' H/s');

		// Start hashing.
		this._worker = setTimeout( () => this._tryNonces(nextBlock), 0);
	}

	async _tryNonces(block) {
		// If the blockchain head has changed in the meantime, abort.
		if (!this._blockchain.headHash.equals(block.prevHash)) {
			return;
		}

		// If we are supposed to stop working, abort.
		if (!this.working) {
			return;
		}

		// Play with the number of iterations to adjust hashrate vs. responsiveness.
		for (let i = 0; i < Miner._iterations; ++i) {
			let isPoW = await block.header.verifyProofOfWork();
			this._hashCount++;

			if (isPoW) {
				const hash = await block.hash();
				console.log('MINED BLOCK!!! nonce=' + block.nonce + ', difficulty=' + block.difficulty + ', hash=' + hash.toBase64() + ', transactionCount=' + block.transactionCount + ', hashrate=' + this._hashrate + ' H/s');

				// Tell listeners that we've mined a block.
				this.fire('block-mined', block, this);

				// Reset worker state.
				clearTimeout(this._worker);
				this._worker = null;

				// Push block into blockchain.
				await this._blockchain.pushBlock(block);

				// We will resume work when the blockchain updates.
				return;
			}

			block.header.nonce += 1;
		}

		this._worker = setTimeout( () => this._tryNonces(block), 0);
	}

	async _getNextBlock() {
		const body = await this._getNextBody();
		const header = await this._getNextHeader(body);
		return new Block(header, body);
	}

	async _getNextHeader(body) {
		const prevHash = await this._blockchain.headHash;
		const accountsHash = this._blockchain.accountsHash;
		const bodyHash = await body.hash();
		const timestamp = this._getNextTimestamp();
		const difficulty = await this._blockchain.getNextDifficulty();
		const nonce = Math.round(Math.random() * 100000);
		return new BlockHeader(prevHash, bodyHash, accountsHash, difficulty, timestamp, nonce);
	}

	async _getNextBody() {
		// Get transactions from mempool (default is maxCount=5000).
		// TODO Completely fill up the block with transactions until the size limit is reached.
		const transactions = await this._mempool.getTransactions();
		return new BlockBody(this._address, transactions);
	}

	_getNextTimestamp() {
		return Math.floor(Date.now() / 1000);
	}

	stopWork() {
		// TODO unregister from head-changed events
		this._stopWork();

		console.log('Miner stopped work');

		// Tell listeners that we've stopped working.
		this.fire('stop', this);
	}

	_stopWork() {
		// TODO unregister from blockchain head-changed events.

		if (this._worker) {
			clearTimeout(this._worker);
			this._worker = null;
		}
		if (this._hashrateWorker) {
			clearInterval(this._hashrateWorker);
			this._hashrateWorker = null;
		}

		this._hashCount = 0;
		this._hashrate = 0;
	}

	_updateHashrate() {
		// Called in 5 second intervals
		this._hashrate = Math.round(this._hashCount / 5);
		this._hashCount = 0;

		// Tell listeners about our new hashrate.
		this.fire('hashrate-changed', this._hashrate, this);
	}

	get address() {
		return this._address;
	}

	get working() {
		return !!this._hashrateWorker;
	}

	get hashrate() {
		return this._hashrate;
	}
}
// XXX Move to configuration
Miner._iterations = 75;
Class.register(Miner);
