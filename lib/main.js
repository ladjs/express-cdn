//     express-cdn
//     Copyright (c) 2012- Nick Baugh <niftylettuce@gmail.com> (http://niftylettuce.com)
//     MIT Licensed

// Node.js module for delivering optimized, minified, mangled, gzipped,
//  and CDN-hosted assets in Express using S3 and CloudFront.

// * Author: [@niftylettuce](https://twitter.com/#!/niftylettuce)
// * Source: <https://github.com/niftylettuce/express-cdn>

// # express-cdn

var fs       = require('fs')
  , url      = require('url')
  , path     = require('path')
  , mime     = require('mime')
  , knox     = require('knox')
  , walk     = require('walk')
  , zlib     = require('zlib')
  , async    = require('async')
  , request  = require('request')
  , _        = require('underscore')
  , jsp      = require('uglify-js').parser
  , pro      = require('uglify-js').uglify
  , spawn    = require('child_process').spawn
  , optipngPath = require('optipng-bin').path
  , jpegtranPath = require('jpegtran-bin').path

_.str = require('underscore.string');
_.mixin(_.str.exports());

var throwError = function(msg) {
  throw new Error('CDN: ' + msg);
};

var logger = function(msg) {
  console.log(msg);
};

// `escape` function from Lo-Dash v0.2.2 <http://lodash.com>
// and Copyright 2012 John-David Dalton <http://allyoucanleet.com/>
// MIT licensed <http://lodash.com/license>
var escape = function(string) {
  return (string + '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

var renderAttributes = function(attributes) {
  var str = [];
  for(var name in attributes) {
    if (_.has(attributes, name)) {
      str.push(escape(name) + '="' + escape(attributes[name]) + '"');
    }
  }
  return str.sort().join(" ");
};

var createTag = function(src, asset, attributes, version) {
  // Cachebusting
  version = version || '';
  // Enable "raw" output
  if ('raw' in attributes && attributes.raw === true) {
    return src + asset + version;
  }
  // Check mime type
  switch(mime.lookup(asset.split('?')[0])) {
    case 'application/javascript':
    case 'text/javascript':
      attributes.type = attributes.type || 'text/javascript';
      attributes.src = src + asset + version;
      return '<script ' + renderAttributes(attributes) + '></script>';
    case 'text/css':
      attributes.rel = attributes.rel || 'stylesheet';
      attributes.href = src + asset + version;
      return '<link ' + renderAttributes(attributes) + ' />';
    case 'image/png':
    case 'image/jpg':
    case 'image/jpeg':
    case 'image/pjpeg':
    case 'image/gif':
      attributes.src = src + asset + version;
      return '<img ' + renderAttributes(attributes) + ' />';
    default:
      throwError('unknown asset type');
  }
};

var renderTag = function(options, assets, attributes) {
  // Set attributes
  attributes = attributes || {};
  // In production mode, check for SSL
  var src = '', position, timestamp = 0;
  if (options.production) {
    if (options.ssl) {
      src = 'https://' + options.domain;
    } else {
      src = 'http://' + options.domain;
    }
    // Process array by breaking file names into parts
    //  and check that array mime types are all equivalent
    if (typeof assets === 'object') {
      var concat = [], type = '';
      for (var b=0; b<assets.length; b+=1) {
        if (type === '') type = mime.lookup(assets[b]);
        else if (mime.lookup(assets[b]) !== type)
          throwError('mime types in CDN array of assets must all be the same');
        // Push just the file name to the concat array
        concat.push(path.basename(assets[b]));
        timestamp += fs.statSync(path.join(options.publicDir, assets[b])).mtime.getTime();
      }
      var name = concat.join("%2B");
      position = name.lastIndexOf('.');
      //name = _(name).splice(position, 0, '.' + timestamp);
      name = name + '?cache=' + timestamp;
      return createTag(src, "/" + name, attributes);
    } else {
      timestamp = fs.statSync(path.join(options.publicDir, assets)).mtime.getTime();
      position = assets.lastIndexOf('.');
      //var name = _(assets).splice(position, 0, '.' + timestamp)
      var name = assets + '?cache=' + timestamp;
      return createTag(src, name, attributes);
    }
  } else {
    // Development mode just pump out assets normally
    var version = '?v=' + new Date().getTime();
    var buf = [];
    if (typeof assets === 'object') {
      for (var i=0; i<assets.length; i+=1) {
        buf.push(createTag(src, assets[i], attributes, version));
        if ( (i + 1) === assets.length) return buf.join("\n");
      }
    } else if (typeof assets === 'string') {
      return createTag(src, assets, attributes, version);
    } else {
      throwError('asset was not a string or an array');
    }
  }

};

var compile = function(fileName, assets, S3, options, method, type, timestamp, callback) {
  var finishUpload = function () {
    return callback && callback();
  };
  return function(err, results) {
    if (err) throwError(err);
    var expires  = new Date(new Date().getTime() + (31556926 * 1000)).toUTCString();
    var headers = {
        'Set-Cookie'                : ''
      , 'response-content-type'     : type
      , 'Content-Type'              : type
      , 'response-cache-control'    : 'maxage=31556926'
      , 'Cache-Control'             : 'maxage=31556926'
      , 'response-expires'          : expires
      , 'Expires'                   : expires
      , 'response-content-encoding' : 'gzip'
      , 'Content-Encoding'          : 'gzip'
    };
    switch(method) {
      case 'uglify':
        if (results instanceof Array) results = results.join("\n");
        var ast = jsp.parse(results);
        ast = pro.ast_mangle(ast);
        ast = pro.ast_squeeze(ast);
        var final_code = pro.gen_code(ast);
        zlib.gzip(final_code, function(err, buffer) {
          if (err) throwError(err);
          S3.putBuffer(buffer, encodeURIComponent(fileName), headers, function(err, response) {
            if (err) return throwError(err);
            if (response.statusCode !== 200) {
              //return throwError('unsuccessful upload of script "' + fileName + '" to S3');
              console.log('unsuccessful upload of script "' + fileName + '" to S3');
              return finishUpload();
            } else {
              logger({ task: 'express-cdn', message: 'successfully uploaded script "' + fileName + '" to S3' });
              return finishUpload();
            }
          });
        });
        break;
      case 'minify':
        if (!(results instanceof Array)) { results = [results]; assets = [assets] }
        var final_code = [];
        //var minify = cleanCSS.process(results);
        // NOTE: We can't minify with cleanCSS because it has so many inconsistencies and invalid optimizations

        for (var key in results) {
          var minify = results[key];
          var assetPath  = assets[key];
          var assetBasePath = path.dirname(assetPath);
          var fileBasePath  = path.dirname(path.join(options.publicDir, fileName));

          // Process images
          minify = minify.replace(/(?:background\-image|background|content)\:[^;]*\)/g, function (rootMatch) {

            //Multiples Images URL per background
            return rootMatch.replace(/url\((?!data:)['"]?([^\)'"]+)['"]?\)/g, function (match, url) {

              if (options.production) {
                var relativePath = url;
                if ('/' === relativePath[0]) {
                  relativePath = path.join(options.publicDir, relativePath.substr(1));
                }
                else {
                  relativePath = path.join(assetBasePath, relativePath);
                }
                var imageResource = compile(relativePath.substr(options.publicDir.length + 1), relativePath, S3, options, 'image', 'image/'+path.extname(url).substr(1), Date.now(), null, null)();
                return 'url('+path.relative(fileBasePath, relativePath)+')';
              } else {
                return 'url('+url+')';
              }
            });
          });

          // Process fonts
          minify = minify.replace(/(?:src)\:[^;]*\)/g, function (rootMatch) {

            //Multiples Fonts URL per SRC
            return rootMatch.replace(/url\((?!data:)['"]?([^\)'"]+)['"]?\)/g, function (match, url) {

              if (options.production) {
                var relativePath = url;
                if ('/' === relativePath[0]) {
                  relativePath = path.join(options.publicDir, relativePath.substr(1));
                }
                else {
                  relativePath = path.join(assetBasePath, relativePath);
                }
                var mimeType = mime.lookup(relativePath);
                var fontResource = compile(relativePath.substr(options.publicDir.length + 1), relativePath, S3, options, 'font', mimeType, Date.now(), null, null)();
                return 'url('+path.relative(fileBasePath, relativePath)+')';
              } else {
                return 'url('+url+')';
              }
            });
          });

          final_code.push(minify);
        }

        zlib.gzip(final_code.join("\n"), function(err, buffer) {
          if (err) throwError(err);
          S3.putBuffer(buffer, encodeURIComponent(fileName), headers, function(err, response) {
            if (err) throwError(err);
            if (response.statusCode !== 200) {
              //throwError('unsuccessful upload of stylesheet "' + fileName + '" to S3');
              console.log('unsuccessful upload of stylesheet "' + fileName + '" to S3');
              return finishUpload();
            } else {
              logger({ task: 'express-cdn', message: 'successfully uploaded stylesheet "' + fileName + '" to S3' });
              return finishUpload();
            }
          });
        });

        break;
      case 'optipng':
        var img = assets;
        var optipng = spawn(optipngPath, [img]);
        optipng.stdout.on('data', function(data) {
          logger({ task: 'express-cdn', message: 'optipng: ' + data });
        });
        optipng.stderr.on('data', function(data) {
          logger({ task: 'express-cdn', message: 'optipng: ' + data });
        });
        optipng.on('exit', function(code) {
          // OptiPNG returns 1 if an error occurs
          if (code !== 0)
            throwError('optipng returned an error during processing \'' + img + '\': ' + code);

          logger({ task: 'express-cdn', message: 'optipng exited with code ' + code });
          fs.readFile(img, function(err, data) {
            zlib.gzip(data, function(err, buffer) {
              S3.putBuffer(buffer, encodeURIComponent(fileName), headers, function(err, response) {
                if (err) throwError(err);
                if (response.statusCode !== 200) {
                  //throwError('unsuccessful upload of image "' + fileName + '" to S3');
                  console.log('unsuccessful upload of image "' + fileName + '" to S3');
                  return finishUpload();
                } else {
                  logger({ task: 'express-cdn', message: 'successfully uploaded image "' + fileName + '" to S3' });
                  // Hack to preserve original timestamp for view helper
                  fs.utimesSync(img, new Date(timestamp), new Date(timestamp));
                  return finishUpload();
                }
              });
            });
          });
        });
        break;
      case 'jpegtran':
        var jpg = assets;
        var jpegtran = spawn(jpegtranPath, [ '-copy', 'none', '-optimize', '-outfile', jpg, jpg ]);
        jpegtran.stdout.on('data', function(data) {
          logger({ task: 'express-cdn', message: 'jpegtran: ' + data });
        });
        jpegtran.stderr.on('data', function(data) {
          throwError(data);
        });
        jpegtran.on('exit', function(code) {
          logger({ task: 'express-cdn', message: 'jpegtran exited with code ' + code });
          fs.readFile(jpg, function(err, data) {
            zlib.gzip(data, function(err, buffer) {
              S3.putBuffer(buffer, encodeURIComponent(fileName), headers, function(err, response) {
                if (err) throwError(err);
                if (response.statusCode !== 200) {
                  //throwError('unsuccessful upload of image "' + fileName + '" to S3');
                  console.log('unsuccessful upload of image "' + fileName + '" to S3');
                  return finishUpload();
                } else {
                  logger({ task: 'express-cdn', message: 'successfully uploaded image "' + fileName + '" to S3' });
                  // Hack to preserve original timestamp for view helper
                  fs.utimesSync(jpg, new Date(timestamp), new Date(timestamp));
                  return finishUpload();
                }
              });
            });
          });
        });
        break;
      case 'image':
      case 'font':
        var image = assets.split("?")[0].split("#")[0];
        fileName  = fileName.split("?")[0].split("#")[0];
        fs.readFile(image, function(err, data) {
          zlib.gzip(data, function(err, buffer) {
            S3.putBuffer(buffer, encodeURIComponent(fileName), headers, function(err, response) {
              if (err) throwError(err);
              if (response.statusCode !== 200) {
                //throwError('unsuccessful upload of image "' + fileName + '" to S3');
                console.log('unsuccessful upload of image "' + fileName + '" to S3');
                return finishUpload();
              } else {
                logger('successfully uploaded image "' + fileName + '" to S3');
                // Hack to preserve original timestamp for view helper
                try {
                  fs.utimesSync(image, new Date(timestamp), new Date(timestamp));
                  return finishUpload();
                } catch (e) {
                  return finishUpload();
                }
              }
            });
          });
        });
        break;
    }
  };
};

var readUtf8 = function(file, callback) {
  fs.readFile(file, 'utf8', callback);
};

var js = ['application/javascript', 'text/javascript'];

// Check if the file already exists
var checkArrayIfModified = function(assets, fileName, S3, options, timestamp, type, callback) {
  var finishUpload = function () {
    return callback && callback(null, assets);
  };
  return function(err, response) {
    if (err) throwError(err);
    if (response.statusCode === 200 && timestamp <= Date.parse(response.headers['last-modified'])) {
      logger({ task: 'express-cdn', message: '"' + fileName + '" not modified and is already stored on S3' });
      return finishUpload();
    } else {
      logger({ task: 'express-cdn', message: '"' + fileName + '" was not found on S3 or was modified recently' });
      // Check file type
      switch(type) {
        case 'application/javascript':
        case 'text/javascript':
          async.map(assets, readUtf8, compile(fileName, assets, S3, options, 'uglify', type, null, finishUpload));
          return;
        case 'text/css':
          async.map(assets, readUtf8, compile(fileName, assets, S3, options, 'minify', type, null, finishUpload));
          return;
        default:
          throwError('unsupported mime type array "' + type + '"');
      }
    }
  };
};

var checkStringIfModified = function(assets, fileName, S3, options, timestamp, callback) {
  var finishUpload = function () {
    return callback && callback(null, assets);
  };
  return function(err, response) {
    if (err) throwError(err);
    if (response.statusCode === 200 && timestamp <= Date.parse(response.headers['last-modified'])) {
      logger({ task: 'express-cdn', message: '"' + fileName + '" not modified and is already stored on S3' });
      return finishUpload();
    } else {
      logger({ task: 'express-cdn', message: '"' + fileName + '" was not found on S3 or was modified recently' });
      // Check file type
      var type = mime.lookup(assets);
      switch(type) {
        case 'application/javascript':
        case 'text/javascript':
          readUtf8(assets, compile(fileName, assets, S3, options, 'uglify', type, null, finishUpload));
          return;
        case 'text/css':
          readUtf8(assets, compile(fileName, assets, S3, options, 'minify', type, null, finishUpload));
          return;
        case 'image/gif':
        case 'image/x-icon':
          compile(fileName, assets, S3, options, 'image', type, timestamp, finishUpload)(null, null);
          return;
        case 'image/png':
          compile(fileName, assets, S3, options, 'optipng', type, timestamp, finishUpload)(null, null);
          return;
        case 'image/jpg':
        case 'image/jpeg':
        case 'image/pjpeg':
          compile(fileName, assets, S3, options, 'jpegtran', type, timestamp, finishUpload)(null, null);
          return;
        default:
          throwError('unsupported mime type "' + type + '"');
      }
    }
  };
};

var processAssets = function(options, results, done) {
  // Create knox instance
  var S3 = knox.createClient({
      key: options.key
    , secret: options.secret
    , bucket: options.bucket
    , endpoint: options.endpoint || null
  });

  // Go through each result and process it
  async.map(results, function (result, iter) {
    var assets = result, type = '', fileName = '', position, timestamp = 0;
    // Combine the assets if it is an array
    if (assets instanceof Array) {
      // Concat the file names together
      var concat = [];
      // Ensure all assets are of the same type
      for (var k=0; k<assets.length; k+=1) {
        if (type === '') type = mime.lookup(assets[k]);
        else if (mime.lookup(assets[k]) !== type)
          throwError('mime types in array do not match');
        assets[k] = path.join(options.publicDir, assets[k]);
        timestamp = Math.max(timestamp, fs.statSync(assets[k]).mtime.getTime());

        concat.push(path.basename(assets[k]));
      }
      // Set the file name
      fileName = concat.join("+");
      position = fileName.lastIndexOf('.');
      //fileName = _(fileName).splice(position, 0, '.' + timestamp);
      S3.headFile(encodeURIComponent(fileName), checkArrayIfModified(assets, fileName, S3, options, timestamp, type, iter));
    } else {
      // Set the file name
      fileName  = assets.substr(1);
      assets    = path.join(options.publicDir, assets);
      position  = fileName.lastIndexOf('.');
      timestamp = fs.statSync(assets).mtime.getTime();
      //fileName = _(fileName).splice(position, 0, '.' + timestamp);
      S3.headFile(encodeURIComponent(fileName), checkStringIfModified(assets, fileName, S3, options, timestamp, iter));
    }
  }, function (err, results) {
    done(err, results);
  });
};

var CDN = function(app, options, callback) {

  // Validate express - Express app instance is an object in v2.x.x and function in 3.x.x
  if (!(typeof app === 'object' || typeof app === 'function')) throwError('requires express');

  // Validate options
  var required = [
      'publicDir'
    , 'viewsDir'
    , 'domain'
    , 'bucket'
    , 'key'
    , 'secret'
    , 'ssl'
    , 'production'
  ];
  required.forEach(function(index) {
    if (typeof options[index] === 'undefined') {
      throwError('missing option "' + index + '"');
    }
  });

  if (options.logger) {
    if (typeof options.logger === 'function')
      logger = options.logger;
  }

  if (options.production && !options.disableWalk) {
    var walker = function () {
      var walker   = walk.walk(options.viewsDir)
        , results  = []
        , regexCDN = /CDN\(([^)]+)\)/g;
      walker.on('file', function(root, stat, next) {
        var validExts = options.extensions || ['.jade', '.ejs'];
        var ext = path.extname(stat.name), text;

        if (_.indexOf(validExts, ext) !== -1) {
          fs.readFile(path.join(root, stat.name), 'utf8', function(err, data) {
            if (err) throwError(err);
            var match;
            while( (match = regexCDN.exec(data)) ) {
              results.push(match[1]);
            }
            next();
          });
        } else {
          next();
        }
      });
      walker.on('end', function() {
        // Clean the array
        for (var i=0; i<results.length; i+=1) {
          // Convert all apostrophes
          results[i] = results[i].replace(/\'/g, '"');
          // Insert assets property name
          results[i] = _(results[i]).splice(0, 0, '"assets": ');
          // Check for attributes
          var attributeIndex = results[i].indexOf('{');
          if (attributeIndex !== -1)
            results[i] = _(results[i]).splice(attributeIndex,0,'"attributes": ');
          // Convert to an object
          results[i] = '{ ' + results[i] + ' }';
          results[i] = JSON.parse(results[i]);
        }
        // Convert to an array of only assets
        var out = [];
        for (var k=0; k<results.length; k+=1) {
          out[results[k].assets] = results[k].assets;
        }
        var clean = [];
        for (var c in out) {
          clean.push(out[c]);
        }
        // Process the results
        if (clean.length > 0) {
          processAssets(options, clean, function (err, results) {
            if (options.cache_file) {
              fs.writeFile(options.cache_file, JSON.stringify(results), function () {
                return callback && callback();
              });
            }
          });
        } else {
          throwError('empty results');
        }
      });
    };

    if (options.cache_file) {
      fs.stat(options.cache_file, function (err, cache_stat) {
        if (err || !(cache_stat && cache_stat.isFile() && cache_stat.size > 0)) {
          walker();
        } else {
          // results are cached, everything already processed and on S3
        }
      });
    } else {
      walker();
    }
  }

  // Return the dynamic view helper
  return function(req, res) {
    return function(assets, attributes) {
      if (typeof assets === 'undefined') throwError('assets undefined');
      return renderTag(options, assets, attributes);
    };
  };

};

module.exports = CDN;
