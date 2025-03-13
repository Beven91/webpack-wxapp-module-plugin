const ModuleDependency = require('webpack/lib/dependencies/ModuleDependency');

class WxWorkerDependency extends ModuleDependency {
	constructor(options, range) {
		super(options);
		this.range = range;
	}

	serialize(context) {
		const { write } = context;
		write(this.range);
		super.serialize(context);
	}

	deserialize(context) {
		const { read } = context;
		this.range = read();
		super.deserialize(context);
	}


  get type() {
    return 'wx createWorker context'
  }

  get category() {
    return 'commonjs'
  }
}

class WxWorkerDependencyTemplate {
  apply(
    dependency,
		source,
		) {
    
  }
}

WxWorkerDependency.Template = WxWorkerDependencyTemplate;

module.exports = WxWorkerDependency;