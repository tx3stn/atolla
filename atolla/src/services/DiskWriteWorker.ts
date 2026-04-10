type WriteJob = () => Promise<void>;

export class DiskWriteWorker {
	private queue: Array<WriteJob> = [];
	private running = false;

	enqueue(job: WriteJob): void {
		this.queue.push(job);
		if (this.running) {
			return;
		}
		this.running = true;
		void this.run();
	}

	private async run(): Promise<void> {
		while (this.queue.length > 0) {
			const job = this.queue.shift();
			if (!job) {
				continue;
			}

			try {
				await job();
			} catch {
				// Best effort background writes.
			}

			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});
		}

		this.running = false;
		if (this.queue.length > 0) {
			this.running = true;
			void this.run();
		}
	}
}
