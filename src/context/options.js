
const serviceTypes = require('./serviceTypes');
const LogLevel    = require('../logLevels');

/**
 * Default options.
 */


module.exports = {
  
    /**
     * See {@link Options.serviceType}
     *
     */
    serviceType: serviceTypes.RESTType,

    /**
     * See {@link Options.logLevel}
     *
     */
    logLevel: LogLevel.Info,

  };