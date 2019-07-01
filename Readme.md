# express-cdn [![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/niftylettuce/express-cdn/trend.png)](https://bitdeli.com/free "Bitdeli Badge") [![NPM version](https://badge.fury.io/js/express-cdn.png)](http://badge.fury.io/js/express-cdn) [![Gittip](http://img.shields.io/gittip/niftylettuce.png)](https://www.gittip.com/niftylettuce/)

Node.js module for delivering optimized, minified, mangled, gzipped, and CDN-hosted assets in Express (currently by Amazon S3 and Amazon CloudFront).

Follow [@niftylettuce](http://twitter.com/niftylettuce) on Twitter for updates.

Like this module?  Check out [node-email-templates](https://github.com/niftylettuce/node-email-templates)!


## Index

- [Features](#features)
- [Add-On Modules](#add-on-modules)
- [How Does It Work?](#how-does-it-work)
- [Environment Differences](#environment-differences)
- [CDN Setup Instructions](#cdn-setup-instructions)
- [Quick Start](#quick-start)
- [Custom Logging](#custom-logging)
- [Lazyweb Requests](#lazyweb-requests)
- [Changelog](#changelog)
- [Contributors](#contributors)
- [License](#license)


## Features

* Automatic parsing of `background`, `background-image` and `content` for `url({{absoluteUrl}})` in stylesheets and scripts.
* Built-in optimization of images in production mode using binaries from NPM of [OptiPNG][1] and [JPEGTran][2].
* Supports [Sass][3], [LESS][4], and [Stylus][5] using respective stylesheet compilers.
* JavaScript assets are mangled and minified using [UglifyJS][6].
* Automatic detection of asset changes and will only upload changed assets to S3 in production mode.
* Utilizes cachebusting, which is inspired by [express-cachebuster][7] and [h5bp][8].
* All assets are compressed using [zlib][9] into a gzip buffer for S3 uploading with `Content-Encoding` header set to `gzip`.
* Embed multiple assets as a single `<script>` or `<link>` tag using the built-in dynamic view helper.
* Loads and processes assets per view (allowing you to minimize client HTTP requests).
* Combine commonly used assets together using a simple array argument.
* Uploads changed assets automatically and asynchronously to Amazon S3 (only in production mode) using [knox][10].


## Add-on Modules

These modules are a **not currently a work in progress**, see [#70](https://github.com/niftylettuce/express-cdn/issues/70).

* [express-cdn-cloudfront][13] - Amazon S3 and Amazon CloudFront
* [express-cdn-maxcdn][14] - MaxCDN and Amazon S3
* [express-cdn-cloudfiles][15] - Rackspace CloudFiles
* [express-cdn-cloudflare][16] - CloudFlare and Amazon S3


## How does it work?

When the server is first started, the module returns a view helper depending on
the server environment (production or development).  It also recursively
searches through your `viewsDir` for any views containing instances of the
`CDN(...)` view helper.  After parsing each instance and removing duplicates,
it will use your S3 credentials to upload a new copy of the production-quality
assets.  Enjoy **:)**.


## Environment Differences

**Development Mode:**

Assets are untouched, cachebusted, and delivered as typical local files for rapid development.

**Production Mode:**

Assets are optimized, minified, mangled, gzipped, delivered by Amazon CloudFront CDN, and hosted from Amazon S3.


## CDN Setup Instructions

1. Visit <https://console.aws.amazon.com/s3/home> and click **Create Bucket**.
  * Bucket Name: `bucket-name`
  * Region: `US Standard` (use `options.endpoint`
    with `'bucket.s3-xxx.amazonaws.com'` for non `US Standard` regions)
2. Upload <a href="https://raw.github.com/niftylettuce/express-cdn/master/index.html">index.html</a> to your new bucket (this will serve as a placeholder in case someone accesses <http://cdn.your-site.com/>).
3. Select `index.html` in the Objects and Folders view from your S3 console and click **Actions &rarr; Make Public**.
4. Visit <https://console.aws.amazon.com/cloudfront/home> and click **Create Distribution**.
  * Choose an origin:
      - Origin Domain Name: `bucket-name.s3.amazonaws.com`
      - Origin ID: `S3-bucket-name`
  * Create default behavior:
      - Path Pattern: `Default (*)`
      - Origin: `S3-bucket-name`
      - Viewer Protocol Policy: `HTTP and HTTPS`
      - Object Caching: `Use Origin Cache Headers`
      - Forward Query String: **Yes** `(Improves Caching)`
  * Distribution details:
      - Alternate Domain Names (CNAMEs): `cdn.your-domain.com`
      - Default Root Object: `index.html`
      - Logging: `Off`
      - Comments: `Created with express-cdn by @niftylettuce.`
      - Distribution State: `Enabled`
5. Copy the generated Domain Name (e.g. `xyz.cloudfront.net`) to your clipboard.
6. Log in to your-domain.com's DNS manager, add a new CNAME "hostname" of `cdn`, and paste the contents of your clipboard as the the "alias" or "points to" value.
7. After the DNS change propagates, you can test your new CDN by visiting <http://cdn.your-domain.com> (the `index.html` file should get displayed).

**SSL Configuration**

Some additional steps are required to enable SSL access of your assets by cloudfront.

1. Visit <https://console.aws.amazon.com/s3/home> and open the bucket's properties.
2. On the permissions tab, click the add bucket policy button.
  * You can use the Policy Generator to generate the appropiate policy with this settings:
      - Type: S3 Bucket Policy
    - Effect: Allow
    - Principal: AWS
    - AWS Service: Amazon S3
    - Actions: GetObject
    - ARN: arn:aws:s3:::<bucket_name>/* (fill in your bucket name)
  * Click on generate policy and paste the output on the add bucket policy window.
  * Save your changes.
3. When you configure express-cdn you must reference cloudfront subdomain directly, since CNAMEs are not supported over ssl.

## Quick Start

```bash
npm install express-cdn
```

```js
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
  , domain     : 'cdn.your-domain.com'
  , bucket     : 'bucket-name'
  , endpoint   : 'bucket-name.s3.amazonaws.com' // optional
  , key        : 'amazon-s3-key'
  , secret     : 'amazon-s3-secret'
  , hostname   : 'localhost'
  , port       : (sslEnabled ? 443 : 1337)
  , ssl        : sslEnabled
  , production : true
};

// Initialize the CDN magic
var CDN = require('express-cdn')(app, options);

app.configure(function() {
  app.set('view engine', 'jade');
  app.set('view options', { layout: false, pretty: true });
  app.enable('view cache');
  app.use(express.bodyParser());
  app.use(express.static(path.join(__dirname, 'public')));
});

// Add the view helper
if (semver.gte(express.version, '4.0.0'))
  app.locals.CDN = CDN();
else if (semver.gte(express.version, '3.0.0'))
  app.locals({ CDN: CDN() });
else
  app.dynamicHelpers({ CDN: CDN });

app.get('/', function(req, res, next) {
  res.render('basic');
  return;
});

console.log("Server started: http://localhost:1337");
app.listen(1337);
```

### Views

#### Jade

```jade
// #1 - Load an image
!= CDN('/img/sprite.png')

// #2 - Load an image with a custom tag attribute
!= CDN('/img/sprite.png', { alt: 'Sprite' })

// #3 - Load an image with a custom tag attribute and data-src attribute instead src
!= CDN('/img/sprite.png', { alt: 'Sprite', 'data-src': true })

// #4 - Load a script
!= CDN('/js/script.js')

// #5 - Load a script with a custom tag attribute
!= CDN('/js/script.js', { 'data-message': 'Hello' })

// #6 - Load and concat two scripts
!= CDN([ '/js/plugins.js', '/js/script.js' ])

// #7 - Load and concat two scripts with custom tag attributes
!= CDN([ '/js/plugins.js', '/js/script.js' ], { 'data-message': 'Hello' })

// #8 - Load a stylesheet
!= CDN('/css/style.css')

// #9 - Load and concat two stylesheets
!= CDN([ '/css/style.css', '/css/extra.css' ])

// #10 - Load a favicon
!= CDN('/img/favicon.ico')
```

#### EJS

```ejs
<!-- #1 - Load an image -->
<%- CDN('/img/sprite.png') %>

<!-- #2 - Load an image with a custom tag attribute -->
<%- CDN('/img/sprite.png', { alt: 'Sprite' }) %>

<!-- #3 - Load an image with a custom tag attribute and data-src attribute instead src -->
<%- CDN('/img/sprite.png', { alt: 'Sprite', 'data-src': true }) %>

<!-- #4 - Load a script -->
<%- CDN('/js/script.js') %>

<!-- #5 - Load a script with a custom tag attribute -->
<%- CDN('/js/script.js', { 'data-message': 'Hello' }) %>

<!-- #6 - Load and concat two scripts -->
<%- CDN([ '/js/plugins.js', '/js/script.js' ]) %>

<!-- #7 - Load and concat two scripts with custom tag attributes -->
<%- CDN([ '/js/plugins.js', '/js/script.js' ], { 'data-message': 'Hello' }) %>

<!-- #8 - Load a stylesheet -->
<%- CDN('/css/style.css') %>

<!-- #9 - Load and concat two stylesheets -->
<%- CDN([ '/css/style.css', '/css/extra.css' ]) %>

<!-- #10 - Load a favicon -->
<%- CDN('/img/favicon.ico') %>
```

### Automatically Rendered HTML

#### Development Mode

```html
<!-- #1 - Load an image -->
<img src="/img/sprite.png?v=1341214029" />

<!-- #2 - Load an image with a custom tag attribute -->
<img src="/img/sprite.png?v=1341214029" alt="Sprite" />

<!-- #3 - Load an image with a custom tag attribute and data-src attribute instead src -->
<img data-src="/img/sprite.png?v=1341214029" alt="Sprite" data-src="true" />

<!-- #4 - Load a script -->
<script src="/js/script.js?v=1341214029" type="text/javascript"></script>

<!-- #5 - Load a script with a custom tag attribute -->
<script src="/js/script.js?v=1341214029" type="text/javascript" data-message="Hello"></script>

<!-- #6 - Load and concat two scripts -->
<script src="/js/plugins.js?v=1341214029" type="text/javascript"></script>
<script src="/js/script.js?v=1341214029" type="text/javascript"></script>

<!-- #7 - Load and concat two scripts with custom tag attributes -->
<script src="/js/plugins.js?v=1341214029" type="text/javascript" data-message="Hello"></script>
<script src="/js/script.js?v=1341214029" type="text/javascript" data-message="Hello"></script>

<!-- #8 - Load a stylesheet -->
<link href="/css/style.css?v=1341214029" rel="stylesheet" type="text/css" />

<!-- #9 - Load and concat two stylesheets -->
<link href="/css/style.css?v=1341214029" rel="stylesheet" type="text/css" />
<link href="/css/extra.css?v=1341214029" rel="stylesheet" type="text/css" />

<!-- #10 - Load a favicon -->
<link href="/img/favicon.ico?v=1341214029" rel="shortcut icon" />
```

#### Production Mode

The protocol will automatically change to "https" or "http" depending on the SSL option.

The module will automatically upload and detect new/modified assets based off timestamp,
as it utilizes the timestamp for version control!  There is built-in magic to detect if
individual assets were changed when concatenating multiple assets together (it adds the
timestamps together and checks if the combined asset timestamp on S3 exists!).

```html
<!-- #1 - Load an image -->
<img src="https://cdn.your-site.com/img/sprite.1341382571.png" />

<!-- #2 - Load an image with a custom tag attribute -->
<img src="https://cdn.your-site.com/img/sprite.1341382571.png" alt="Sprite" />

<!-- #3 - Load an image with a custom tag attribute -->
<img data-src="https://cdn.your-site.com/img/sprite.1341382571.png" alt="Sprite" data-src="true" />

<!-- #4 - Load a script -->
<script src="https://cdn.your-site.com/js/script.1341382571.js" type="text/javascript"></script>

<!-- #5 - Load a script with a custom tag attribute -->
<script src="https://cdn.your-site.com/js/script.1341382571.js" type="text/javascript" data-message="Hello"></script>

<!-- #6 - Load and concat two scripts -->
<script src="https://cdn.your-site.com/plugins%2Bscript.1341382571.js" type="text/javascript"></script>

<!-- #7 - Load and concat two scripts with custom tag attributes -->
<script src="https://cdn.your-site.com/plugins%2Bscript.1341382571.js" type="text/javascript" data-message="Hello"></script>

<!-- #8 - Load a stylesheet -->
<link href="https://cdn.your-site.com/css/style.1341382571.css" rel="stylesheet" type="text/css" />

<!-- #9 - Load and concat two stylesheets -->
<link href="https://cdn.your-site.com/style%2Bextra.1341382571.css" rel="stylesheet" type="text/css" />

<!-- #10 - Load a favicon -->
<link href="https://cdn.your-site.com/img/favicon.1341382571.ico" rel="shortcut icon" />
```


## Custom Logging

By default log messages will be sent to the console. If you would like to use a custom logger function you may pass it in as `options.logger`

The example below uses the [Winston][12] logging library.

```javascript
var winston = require('winston');
winston.add(winston.transports.File, {filename: 'somefile.log'});

// Set the CDN options
var options = {
    publicDir  : path.join(__dirname, 'public')
  , viewsDir   : path.join(__dirname, 'views')
  , domain     : 'cdn.your-domain.com'
  , bucket     : 'bucket-name'
  , key        : 'amazon-s3-key'
  , secret     : 'amazon-s3-secret'
  , hostname   : 'localhost'
  , port       : 1337
  , ssl        : false
  , production : true
  , logger     : winston.info
};

// Initialize the CDN magic
var CDN = require('express-cdn')(app, options);

app.configure(function() {
  app.set('view engine', 'jade');
  app.set('view options', { layout: false, pretty: true });
  app.enable('view cache');
  app.use(express.bodyParser());
  app.use(express.static(path.join(__dirname, 'public')));
});

// Add the dynamic view helper
app.dynamicHelpers({ CDN: CDN });

```

Any output from express-cdn is now passed to `winston.info()` which writes to both `console` and `somefile.log`.


## Lazyweb Requests

These are feature requests that we would appreciate contributors for:

* Git SHA cachebusting instead of timestamp
* Add support for multiple view directories
* Add cache busting for CSS scraper
* Add font CSS scraper for uploading fonts with proper mimetypes and cachebusting
* Add options to pick CDN network (e.g. MaxCDN vs. Amazon vs. Rackspace)
* Add tests for all asset types.
* Modularization of `/lib/main.js` please!
* Support Express 3.x.x+ and utilize async with view helper.
* Convert from `fs.statSync` to `fs.stat` with callback for image assets modified timestamp hack.
* Investigate why Chrome Tools Audit returns leverage proxy cookieless jargon.


## Changelog

* 0.2.3 - Added support for SVG files (by @zhangchiqing)

* 0.2.2 - Fixed uglifyjs license comment regex (by @kudos), fixed wrong mimetypes for minify case in compile method (by @kaskovsky)

* 0.2.1 - Fixed cursor css property also can be url (by @sars)

* 0.2.0 - Support for CSS @media query attribute with parenthesis (by @jfred)

* 0.1.9 - Added cleanCSS support to minify CSS (by @DServy)

* 0.1.8 - Added favicon support (by @mateusz-)

* 0.1.7 - Fixed issue with knox (by @DServy)

* 0.1.6 - Fixed extracting CSS border-image resources and image snot followed by `;` in CSS (by @lxe)

* 0.1.5 - Preserved license comments with UglifyJS version 2.0 (by @mateusz-)

* 0.1.4 - Added case insensitive usage of `cdn` or `CDN` (by @leostera)

* 0.1.3 - Explicity set `x-amz-acl` to `public-read`.

* 0.1.2 - Added protocol relative paths for HTTP/HTTPS via `//` (by @Nevtep)

* 0.1.1 - Add ability to specify template extension

* 0.1.0 - Fixed endpoint issue, fixed knox issue, added optipng binary, added jpegtran binary, **no longer requires optipng or jpegtran server dependencies!**

* 0.0.9 - Allowed explicit setting of S3 endpoint (by @eladb)

* 0.0.8 - Enabled string-only output for CDN assets.

    ```jade
    - var href = CDN('/img/full/foo.jpg', { raw : true });
    a(class="fancybox", href="#{href}")
      != CDN('/img/small/foo.jpg', { alt : 'Foo', width : 800, height : 600 })
    ```

* 0.0.7 - Removed CSS minification due to over-optimization of the `clean-css` module.

* 0.0.6 - Added temporary support for CSS usage of `background-image`, `background`, and `contents` attributes by absolute image paths.

    ```css
    /* Valid - Proper way to write CSS with express-cdn */
    #example-valid {
      background: url(/something.png);
    }

    /* Invalid - Don't do this! */
    #example-invalid {
      background: url(../something.png);
    }
    ```


## Contributors

* Nick Baugh <niftylettuce@gmail.com>
* Daniel Santiago
* James Wyse <james@jameswyse.net>
* Jon Keating <jon@licq.org>
* Andrew de Andrade <andrew@deandrade.com.br>
* [Joshua Gross](http://www.joshisgross.com) <josh@spandex.io>
* Dominik Lessel <info@rocketeleven.com>
* Elad Ben-Israel <elad.benisrael@gmail.com>
* Aleksey Smolenchuk <lxe@lxe.co>
* David Staley <Dstaley234@gmail.com>
* Joshua Frederick <josh@jfred.net>
* Rodion <i6@bk.ru>
* kaskovsky
* [Jonathan Cremin](http://crem.in)
* Leo Zhang <zhangchiqing@gmail.com>
* Herman-Scheer <g@herman-scheer.com>

## License

The MIT License

Copyright (c) 2012- Nick Baugh niftylettuce@gmail.com (http://niftylettuce.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


[1]: http://optipng.sourceforge.net/
[2]: http://jpegclub.org/jpegtran/
[3]: http://sass-lang.com/
[4]: http://lesscss.org/
[5]: http://learnboost.github.com/stylus/
[6]: https://github.com/mishoo/UglifyJS/
[7]: https://github.com/niftylettuce/express-cachebuster/
[8]: http://h5bp.com/
[9]: http://nodejs.org/api/zlib.html
[10]: https://github.com/LearnBoost/knox/
[11]: https://github.com/mxcl/homebrew/
[12]: https://github.com/flatiron/winston/
[13]: https://github.com/niftylettuce/express-cdn-cloudfront
[14]: https://github.com/niftylettuce/express-cdn-maxcdn
[15]: https://github.com/niftylettuce/express-cdn-cloudfiles
[16]: https://github.com/niftylettuce/express-cdn-cloudflare
