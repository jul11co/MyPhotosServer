// routes/cache.js

var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var fse = require('fs-extra');

var config = require('../config');

// CACHE

var cacheRoot = config.getCacheRoot();

var fileExists = function(path) {
  var result = false;
  try {
    var stats = fs.statSync(path);
    if (stats.isFile()) {
      result = true;
    }
  } catch (e) {
    // console.log(e);
  }
  return result;
}

var directoryExists = function(path) {
  var result = false;
  try {
    var stats = fs.statSync(path);
    if (stats.isDirectory()) {
      result = true;
    }
  } catch (e) {
    // console.log(e);
  }
  return result;
}

var getCachedImagePath = function(image_src) {
  var hashed_url = crypto.createHash('md5').update(image_src).digest("hex");
  var url_obj = url.parse(image_src);
  var url_hostname = (url_obj) ? url_obj.hostname : '';
  var cached_image_path = '';
  if (!url_hostname || url_hostname == '') {
    cached_image_path = path.join('/images', 'nohost', hashed_url);
  } else {
    cached_image_path = path.join('/images', url_hostname, hashed_url);
  }
  return cached_image_path;
}

// GET /cache/image?src=...
exports.cacheImage = function (req, res, next) {
  var served = false;
  if (typeof req.query.src == 'undefined') {
    return res.json({
      error: { message: 'Missing required fields (src)' }
    });
  }
  var image_src = req.query.src;
  if (image_src.indexOf('//') == 0) {
    image_src = 'http:' + image_src;
  }
  // console.log(image_src);
  var cached_image_path = getCachedImagePath(image_src);
  var cached_image_abs_path = path.join(cacheRoot, cached_image_path);
  if (fileExists(cached_image_abs_path)) {
    // redirect to cached file
    served = true;
    return res.redirect(cached_image_path);
  }
  // request image from source
  var url_parts = url.parse(image_src, true);
  var options = {
    host: url_parts.host,
    path: url_parts.path
  };
  var request = http.get(options, function(response) {
    if (response.statusCode === 200) {
      var parent_dir_path = path.dirname(cached_image_abs_path);
      fse.ensureDirSync(parent_dir_path);
      var cached_image = fs.createWriteStream(cached_image_abs_path);
      response.pipe(cached_image);
      response.on('error', function(err) {
        console.log('Response error: ', err);
        console.log(response.headers);
      });
      response.on('end', function() {
        // console.log('Response ended.');
      });
      cached_image.on('error', function(err) {
        console.log('Caching image error: ', err);
      });
      cached_image.once('finish', function () {
        // redirect to cached file
        if (!served) {
          served = true;
          res.redirect(cached_image_path);
        }
      });
    } else {
      if (!served) {
        served = true;
        res.writeHead(response.statusCode);
        res.end(); 
      }
    }
  });
  request.on('error', function(err) {
    console.log(err.message);
    if (!served) {
      served = true;
      res.writeHead(404);
      res.end();
    }
  });
}
