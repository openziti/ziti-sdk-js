// The karma tests include all standard unit tests...
require('../unit');

// Items below require a browser, so are only run under Karma
require('./utils');
require('./client');
