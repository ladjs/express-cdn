
// # express-cdn

var express = require('express')
  , path    = require('path')
  , app     = express.createServer()
  , semver  = require('semver');

var sslEnabled = false

// Set the CDN options
var options = {
    publicDir  : path.join(__dirname, 'public')
  , viewsDir   : path.join(__dirname, 'views')
  , domain     : 'cdn.your-domain.com' // or your generated cloudfront domain
  , bucket     : 'bucket-name'
  , endpoint   : 'bucket-name.s3.amazonaws.com'
  , key        : 'amazon-s3-key'
  , secret     : 'amazon-s3-secret'
  , hostname   : 'localhost'
  , port       : (sslEnabled) ? 443 : 1337
  , ssl        : sslEnabled
  , production : true
};

// Initialize the CDN magic
var CDN = require('../')(app, options);

app.configure(function() {
  app.set('view engine', 'jade');
  app.set('view options', { layout: false, pretty: true });
  app.set('views', path.join(__dirname, 'views'));
  app.enable('view cache');
  app.use(express.bodyParser());
  app.use(express.static(path.join(__dirname, 'public')));
});

// Add the view helper
if (semver.gte(express.version, '3.0.0'))
  app.locals({ CDN: CDN() });
else
  app.dynamicHelpers({ CDN: CDN });

app.get('/', function(req, res, next) {
  res.render('basic');
  return;
});

console.log("Server started: http://localhost:1337");
app.listen(1337);
