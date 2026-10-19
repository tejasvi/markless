const fs = require('fs');
const path = require('path');
const Mocha = require('mocha');

function run() {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 30000,
	});

	for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))) {
		mocha.addFile(path.resolve(__dirname, file));
	}

	return new Promise((c, e) => {
		mocha.run(failures => {
			if (failures > 0) {
				e(new Error(`${failures} tests failed.`));
			} else {
				c();
			}
		});
	});
}

module.exports = {
	run
};
