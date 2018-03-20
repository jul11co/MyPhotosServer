// importers/tumblr.js

var request = require('request');
var zlib = require('zlib');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var async = require('async');

var utils = require('jul11co-wdt').Utils;
var downloader = require('jul11co-wdt').Downloader;
var JsonStore = require('jul11co-wdt').JsonStore;

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var TumblrImporter = function(options) {
	EventEmitter.call(this);
	options = options || {};
}

util.inherits(TumblrImporter, EventEmitter);

TumblrImporter.prototype.start = function(input_url, output_dir, options) {
	if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  var start_url = input_url;

  if (input_url.indexOf('.tumblr.com/tagged/') > 0) {
    var index = input_url.indexOf('/tagged/');
    start_url = input_url.substring(0, index);
    options.tag = input_url.substring(index + 8);
    options.tag = utils.replaceAll(options.tag, '-', '+');
  }

  var tumblr_store = new JsonStore({ file: path.join(output_dir, 'tumblr.json') });
  var urls = tumblr_store.get('urls');
  if (!urls) {
  	urls = [];
  	urls.push(start_url);
		tumblr_store.set('urls', urls);
  } else {
  	if (urls.indexOf(start_url) == -1) {
	  	urls.push(start_url);
			tumblr_store.update('urls', urls);
  	}
  }
  tumblr_store.set('url', start_url);

  if (options.tagged) {
    tumblr_store.set('tagged', options.tagged);
  }
  if (options.tag) {
    tumblr_store.set('tagged', options.tag);
  }

  var self = this;

  self.emit('started');

  options.download_handler = function(photos, done) {
  	console.log('download_handler: photos ' + photos.length);

  	var current = 0;
  	var total = photos.length;

  	async.eachSeries(photos, function(photo, cb) {

			current++;
			self.emit('progress', {current: current, total: total});
 
  		var image_src = '';
	  	if (typeof photo == 'string') {
	      image_src = photo;     
	    } else if (typeof photo == 'object') {
	      image_src = photo.image_src || photo.src;
	    }

  		downloader.downloadImage(image_src, {
  			output_dir: output_dir,
  			skip_if_exist: true
  		}, function(err, res) {
  			if (err) {
  				self.emit('error', err);
  			} else {
  				self.emit('file', {
  					path: path.resolve(res.file),
  					file: path.basename(res.file),
  					src: image_src
  				});
  			}
  			console.log('Download image finished:', image_src, res.file);
  			cb();
  		});
  	}, done);
  };

  tumblrDownload(start_url, output_dir, options, function(err) {
  	if (err) {
  		self.emit('error', err);
  	}
		self.emit('stopped', err);
  });
}

TumblrImporter.prototype.stop = function() {
  console.log('stop: not implemented.');
}

module.exports = TumblrImporter;

///

function md5Hash(string) {
  return crypto.createHash('md5').update(string).digest('hex');
}

function requestWithEncoding(options, callback) {
  var req_err = null;
  try {
    var req = request.get(options);

    req.on('response', function(res) {
      var chunks = [];

      res.on('data', function(chunk) {
        chunks.push(chunk);
      });

      res.on('end', function() {
        if (!req_err) {
          var buffer = Buffer.concat(chunks);
          var encoding = res.headers['content-encoding'];
          if (encoding == 'gzip') {
            zlib.gunzip(buffer, function(err, decoded) {
              callback(err, res, decoded && decoded.toString());
            });
          } else if (encoding == 'deflate') {
            zlib.inflate(buffer, function(err, decoded) {
              callback(err, res, decoded && decoded.toString());
            })
          } else {
            callback(null, res, buffer.toString());
          }
        }
      });
    });

    req.on('error', function(err) {
      console.log('requestWithEncoding:error');
      console.log(err);
      if (!req_err) {
        req_err = err;
        callback(err);
      }
    });
  } catch(e) {
    console.log('requestWithEncoding:exception');
    console.log(e);
    if (!req_err) {
      req_err = e;
      callback(e);
    }
  }
}

function downloadUrl(url, options, attempts, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
    attempts = 0;
  }
  if (typeof attempts == 'function') {
    callback = attempts;
    attempts = 0;
  }

  var request_url = url;
  // if (options.html_proxy && options.html_proxy != '') {
  //   request_url = options.html_proxy + '?url=' + encodeURIComponent(request_url);
  // }
  var request_options = {
    url: request_url,
    headers: {
      'User-Agent': 'tumblr-dl'
    },
    timeout: 60000 /* 60 seconds */
  };
  requestWithEncoding(request_options, function(error, response, content) {
    if (error) {
      // console.log(error);
      attempts++;
      if (error.code == "ESOCKETTIMEDOUT" || error.code == "ETIMEDOUT" 
        || error.code == "ECONNRESET") {
        var max_attempts = options.max_attempts || 5;
        var backoff_delay = options.backoff_delay || 5000; // 5 seconds
        if (attempts < max_attempts) {
          console.log('Timeout! Retrying... (' + attempts + ')');
          setTimeout(function() {
            downloadUrl(url, options, attempts, callback);
          }, backoff_delay);
          return;
        }
      }
      return callback(error);
    }

    if (response.statusCode != 200) {
      return callback(new Error('Request failed with response status code ' + response.statusCode));
    }

    return callback(null, {
      requested_url: url,
      resolved_url: response.request.href,
      content_type: response.headers['content-type'],
      content: content
    });
  });
}

function saveFileSync(output_file, content, encoding) {
  var output_dir = path.dirname(output_file);
  utils.ensureDirectoryExists(output_dir);

  fs.writeFileSync(output_file, content, encoding || 'utf8');
}

function trimRightUntilChar(string, last_char) {
  var tmp = string.slice(0);
  var c = tmp.substr(tmp.length - 1);
  while(c != last_char) {
    tmp = tmp.slice(0, -1);
    c = tmp.substr(tmp.length - 1);
  }
  if (c == last_char) {
    tmp = tmp.slice(0, -1);
  }
  return tmp;
}

// https://www.tumblr.com/docs/en/api/v1
// API JSON URL : http://(YOU).tumblr.com/api/read/json
//
// The most recent 20 posts are included by default.
//
// GET Parameters (options):
//   start - The post offset to start from. The default is 0.
//   num - The number of posts to return. The default is 20, and the maximum is 50.
//   type - The type of posts to return. If unspecified or empty, all types of posts 
//          are returned. Must be one of 'text', 'quote', 'photo', 'link', 'chat', 'video', or 'audio'.
//   id - A specific post ID to return. Use instead of start, num, or type.
//   filter - Alternate filter to run on the text content. Allowed values:
//       'text' - Plain text only. No HTML.
//       'none' - No post-processing. Output exactly what the author entered. 
//            (Note: Some authors write in Markdown, which will not be converted to 
//             HTML when this option is used.)
//   tagged - Return posts with this tag in reverse-chronological order (newest first). 
//          Optionally specify chrono=1 to sort in chronological order (oldest first).
exports.getTumblrJson = function(base_url, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  options.num = options.num || 50;

  var api_json_url = base_url + '/api/read/json';
  if (base_url.substr(base_url.length-1) == '/') {
    api_json_url = base_url + 'api/read/json';
  }

  var query_string = '';
  if (options.start) {
    query_string += 'start=' + options.start;
  }
  if (options.num) {
    if (query_string != '') query_string += '&';
    query_string += 'num=' + options.num;
  }
  if (options.filter) {
    if (query_string != '') query_string += '&';
    query_string += 'filter=' + options.filter;
  }
  if (options.tagged) {
    if (query_string != '') query_string += '&';
    query_string += 'tagged=' + options.tagged;
  }
  if (options.tag) {
    if (query_string != '') query_string += '&';
    query_string += 'tagged=' + options.tag;
  }
  if (query_string != '') api_json_url += '?' + query_string;

  if (options.verbose) console.log('Tumblr JSON:', api_json_url);
  downloadUrl(api_json_url, {}, function(err, result) {
    if (err) {
      return callback(err);
    }
    if (!result.content) {
      return callback(new Error('Missing content'));
    }

    // if (result.content_type) {
    //   console.log(result.content_type);
    // }

    // saveFileSync('content.js', result.content);
    
    // FIXME: dangerous, should be done by stripping "var tumblr_api_read = " and ";"   
    // eval(result.content);

    var tumblr_api_read = {};
    var content_json = '';
    if (result.content.indexOf('var tumblr_api_read = ') == 0) {
      content_json = result.content.replace('var tumblr_api_read = ', '');
      content_json = trimRightUntilChar(content_json, ';');
    }

    // saveFileSync('content.json', content_json);

    try {
      tumblr_api_read = JSON.parse(content_json);
    } catch(err) {
      console.log('Parse JSON error.');
      return callback(err);
    }

    callback(null, {
      requested_url: result.requested_url,
      resolved_url: result.resolved_url,
      json: tumblr_api_read
    });
  });
}

function tumblrDownload(start_url, output_dir, options, callback) {

  var posts_store = new JsonStore({ file: path.join(output_dir, 'tumblr-posts.json') });
  var photos_store = new JsonStore({ file: path.join(output_dir, 'tumblr-photos.json') });

  var posts_count = 0;
  var posts_total = 0;
  var download_queue = [];

  var downloadPhotosHandler = function() {
    console.log('Download photos...');
    console.log('Download queue:', download_queue.length);
    downloader.downloadImages(download_queue, {
      output_dir: path.join(output_dir, 'photos'),
      skip_if_exist: true
    }, function(err, images) {
      if (err) {
        return callback(err);
      }
      callback(null);
    });
  }

  var nextTumblrPage = function() {
    if (posts_count < posts_total) {
      options.start = posts_count;
      console.log('Fetching metadata...', posts_count, '/', posts_total);
      exports.getTumblrJson(start_url, options, tumblrResultHandler);
    } else {
      console.log('Fetching metadata...', posts_count, '/', posts_total);
      if (typeof options.download_handler == 'function') {
      	options.download_handler(download_queue, callback);
      } else {
      	downloadPhotosHandler();
      }
    }
  }

  var tumblrResultHandler = function(err, result) {
    if (err) {
      return callback(err);
    }
    if (!result.json) {
      return callback(new Error('Missing data'));
    }

    if (result.json.posts && result.json.posts.length) {
      result.json.posts.forEach(function(post_info) {
        // Store
        delete post_info['like-button'];
        delete post_info['reblog-button'];

        // Store post data
        var post_data = posts_store.get(post_info.id);
        if (!post_data) {
          posts_store.set(post_info.id, post_info);
        }

        // Store biggest photo in single photo-posts
        if (post_info['photo-url-1280']) {
          var photo_id = md5Hash(post_info['photo-url-1280']);
          var photo_data = photos_store.get(photo_id);
          if (!photo_data) {
            photos_store.set(photo_id, {
              src: post_info['photo-url-1280']
            });
            download_queue.push(post_info['photo-url-1280']);
          }
        }

        // Store biggest photos in multiple-photos post
        if (post_info['photos'] && post_info['photos'].length) {
          post_info['photos'].forEach(function(photo_info) {
            if (photo_info['photo-url-1280']) {
              var photo_id = md5Hash(photo_info['photo-url-1280']);
              var photo_data = photos_store.get(photo_id);
              if (!photo_data) {
                photos_store.set(photo_id, {
                  src: photo_info['photo-url-1280']
                });
                download_queue.push(photo_info['photo-url-1280']);
              }
            }
          });
        }
      });

      posts_count += result.json.posts.length;
    }

    var posts_start = result.json['posts-start'];
    posts_total = result.json['posts-total'];

    nextTumblrPage();
  };

  console.log('Fetching metadata...');
  exports.getTumblrJson(start_url, options, tumblrResultHandler);
}
