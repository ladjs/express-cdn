
// # express-cdn

var express = require('express')
  , path    = require('path')
  , app     = express.createServer();

// Set the CDN options
var options = {
    publicDir  : path.join(__dirname, 'public')
  , viewsDir   : path.join(__dirname, 'views')
  , domain     : 'cdn.your-domain.com'
  , bucket     : 'bucket-name'
  , endpoint   : 'bucket-name.s3-eu-west-1.amazonaws.com' // optional
  , key        : 'amazon-s3-key'
  , secret     : 'amazon-s3-secret'
  , hostname   : 'localhost'
  , port       : 1337
  , ssl        : false
  , production : true
};

// Initialize the CDN magic
var CDN = require('../')(app, options);

app.configure(function() {
  app.set('view engine', 'jade');
  app.set('view options', { layout: false, pretty: true });
  app.enable('view cache');
  app.use(express.bodyParser());
  app.use(express.static(path.join(__dirname, 'public')));
});

// Add the dynamic view helper
app.dynamicHelpers({ CDN: CDN });

app.get('/', function(req, res, next) {
  res.render('basic');
  return;
});

console.log("Server started: http://localhost:1337");
app.listen(1337);
