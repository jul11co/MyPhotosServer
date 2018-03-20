// importers/pinterest.js

var path = require('path');
var urlutil = require('url');

var async = require('async');
var cheerio = require('cheerio');

var utils = require('jul11co-wdt').Utils;
var downloader = require('jul11co-wdt').Downloader;
var Saver = require('jul11co-wdt').Saver;

var Nightmare = require('nightmare');
var vo = require('vo');

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var default_max_images = 100;

var PinterestImporter = function(options) {
  options = options || {};
  EventEmitter.call(this);
}

util.inherits(PinterestImporter, EventEmitter);

PinterestImporter.prototype.start = function(input_url, output_dir, options) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  options.html_file_root = '.html';
  options.nightmare = {
    options: {
      // waitTimeout: 20000, // in ms
      show: false
    },
    wait: '.App'
  };

  if (options.max_images) {
    options.max_images = parseInt(options.max_images);
  } else {
    options.max_images = default_max_images;
  }

  if (options.show) {
    options.nightmare.options.show = true;
  }
  if (options.dev) {
    options.nightmare.options.openDevTools = {
      mode: 'detach'
    };
  }

  var self = this;

  self.emit('started');

  self.extractPhotos(input_url, options, function(err, photos) {
    if (err) return callback(err);

    console.log('extractPhotos: photos ' + photos.length);

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
        console.log('Photo downloaded:', image_src, res.file);
        cb();
      });
    }, function(err) {
      if (err) {
        self.emit('error', err);
      }
      self.emit('stopped', err);
    });

  });

}

PinterestImporter.prototype.stop = function() {

}

module.exports = PinterestImporter;

function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// data: {
//   url: String,
//   file: String,
//   timestamp: Number,
//   speed: Number, // kB/s
//   percentage: percentage, // %
//   current: current, // bytes
//   total: total // bytes
// }
var print_progress = function(data) {
  if (data && data.file) {
    if (data.current < data.total) {
      process.stdout.write(
        path.relative('.', data.file)
        + ' ' + numberWithCommas(data.current) 
        + ' ' + data.percentage + '% ' + data.speed + 'kB/s\r');
    } else if (data.current == data.total) {
      console.log(
        path.relative('.', data.file)
        + ' ' + numberWithCommas(data.total) 
        + ' 100%');
    }
  }
}

var nightmare = null;

function getNightmare(options) {
  nightmare = nightmare || Nightmare(options.nightmare.options);
  return nightmare;
}

function releaseNightmare() {
  if (nightmare) {
    nightmare.end();
    nightmare = null;
  }
}

// https://stackoverflow.com/questions/36723849/nightmare-conditional-wait
Nightmare.action('waitForSelector', function(selector, max_attempts, done) {
  var attempt = 0;
  var self = this;

  function doEval() {
    // console.log('waitForSelector', selector, attempt);
    self.evaluate_now(function(selector) {
      return (document.querySelector(selector) !== null);
    }, function(err, result) {
      // console.log('waitForSelector', selector, attempt, result);
      if (result) {
        done(null, true);
      } else {
        attempt++;
        if (attempt < max_attempts) {
          setTimeout(doEval, 2000);
        } else {
          console.log('waitForSelector', selector, 'timeout');
          done(null, false);
        }
      }
    }, selector);
  };
  doEval();
  return this;
});

Nightmare.action('extractHtml', function(done) {
  var self = this;

  console.log('Nightmare: extractHtml');
  self.evaluate_now(function() {
    // page's HTML
    var node = document.doctype;
    var doctype = "";
    if (!node) {
      doctype = "<!DOCTYPE "
         + node.name
         + (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '')
         + (!node.publicId && node.systemId ? ' SYSTEM' : '') 
         + (node.systemId ? ' "' + node.systemId + '"' : '')
         + '>';
    }
    return (doctype + document.documentElement.outerHTML);
  }, done);

  return this;
});

Nightmare.action('scrollToEnd', function(done) {
  var self = this;

  console.log('Nightmare: scrollToEnd');
  self.evaluate_now(function() {
    var scrollHeight = document.body.scrollHeight;
    window.scrollTo(0, scrollHeight);
    return scrollHeight;
  }, function(err, height) {
    console.log('Nightmare: scrollToEnd', height);
    // self.scrollTo(0, height);
    done(null, true);
  });

  return this;
});

var voScrapePinterest = function * (nightmare, url, max_images) {

  console.log('scrapePinterest');
  console.log('URL:', url);
  console.log('Max images allow:', max_images);

  yield nightmare.goto(url);
  yield nightmare.waitForSelector('.App', 10)
  yield nightmare.wait(5000);

  var last_images_count = 0;
  var scrape_end = false;

  var page_html = '';
  var images = [];

  while (!scrape_end) {
    var html = yield nightmare.evaluate(function() {
      // page's HTML
      var node = document.doctype;
      var doctype = "";
      if (!node) {
        doctype = "<!DOCTYPE "
           + node.name
           + (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '')
           + (!node.publicId && node.systemId ? ' SYSTEM' : '') 
           + (node.systemId ? ' "' + node.systemId + '"' : '')
           + '>';
      }
      return (doctype + document.documentElement.outerHTML);
    });

    if (html) {
      console.log('Nightmare: scrapePinterest', 'Got HTML', html.length);
      
      page_html = html;

      var $ = cheerio.load(html);
      console.log('Pictures: ' + $('.GrowthUnauthPinImage img').length);

      images = [];
      $('.GrowthUnauthPinImage img').each(function() {
        images.push({
          src: $(this).attr('src'),
          alt: $(this).attr('alt')
        });
      });

      $ = null;

      if (last_images_count == images.length) {
        scrape_end = true;
      } else if (last_images_count > max_images) {
        // exceed max
        scrape_end = true;
      } else {
        last_images_count = images.length;

        yield nightmare.scrollToEnd();
        yield nightmare.wait(5000);
      }
    } else {
      console.log('Nightmare: scrapePinterest', 'Invalid HTML');

      scrape_end = true;
    }
  }

  yield nightmare.end();

  // console.log('Images:', images.length);
  return {html: html, images: images};
}

function scrapePinterest(nightmare, url, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  vo(voScrapePinterest)(nightmare, url, options.max_images || 100)
    .then(function(result) {
      callback(null, result[0].html, result[0].images);
    })
    .catch(function(err) {
      console.err(err);
      callback(err);
    });
}

PinterestImporter.prototype.downloadPage = function(url, options, callback) {
  // console.log('downloadPage:', options.nightmare);
  if (options.nightmare) {
    var nightmare = getNightmare(options);
    scrapePinterest(nightmare, url, options, function (err, html, images) {
      if (err) return callback(err);
      return callback(null, {
        url: url,
        $: cheerio.load(html),
        html: html,
        // images: images
      });
    });
  } else {
    downloader.downloadPage(url, options, callback);
  }
}

// options
// {
//   blacklist: [String],
//   filters: [String]
// }
var getImages = function($, page, selector, options) {
  // console.log('getImages()');
  options = options || {};
  var blacklist = options.blacklist || [];
  var filters = options.filters || [];
  var image_urls = [];
  var image_file_names = [];
  var images = [];
  var page_host_url = utils.urlGetHost(page.url);
  var page_host_url_obj = urlutil.parse(page_host_url);
  var page_url_obj = urlutil.parse(page.base_url || page.url);
  $('' + selector + ' img').each(function(){
    var image_src = $(this).attr('src');
    var image_alt = $(this).attr('alt');
    if (image_src && image_src != "") {
      if (image_src.indexOf('data:') == 0) return;
      var image_url = image_src;
      if (image_url.indexOf('//') == 0) {
        image_url = page_host_url_obj.protocol + image_url;
      }
      var image_url_obj = urlutil.parse(image_url);
      if (!image_url_obj.host) {
        // image_url = urlutil.resolve(page_host_url_obj, image_url_obj);
        if (link_url.indexOf('/') == 0) {
          image_url = urlutil.resolve(page_host_url_obj, image_url_obj);
        } else {
          image_url = urlutil.resolve(page_url_obj, image_url_obj);
        }
      } else {
        image_url = urlutil.format(image_url_obj);
      }
      if (image_urls.indexOf(image_url) >= 0) return;
      image_urls.push(image_url);
      if (typeof blacklist != 'undefined' && blacklist.length > 0) {
        var blacklisted = false;
        for (var i = 0; i < blacklist.length; i++) {
          if (image_url.indexOf(blacklist[i]) >= 0) {
            blacklisted = true;
            break;
          }
        }
        if (blacklisted) return;
      }
      if (typeof filters != 'undefined' && filters.length > 0) {
        // for (var i = 0; i < filters.length; i++) {
        //   if (image_url.indexOf(filters[i]) == -1) return;
        // }
        var filter_out = true;
        for (var i = 0; i < filters.length; i++) {
          if (link_url.indexOf(filters[i]) >= 0) {
            filter_out = false;
            break;
          }
        }
        if (filter_out) return;
      }
      var image_file_name = path.basename(image_url_obj.pathname);
      image_file_name = utils.getUniqueFileName(image_file_names, image_file_name);
      var image_info = {
        src: image_url,
        file: image_file_name
      };
      if (image_alt && image_alt != '') image_info.alt = image_alt;
      images.push(image_info);
    }
  });
  return images;
}

PinterestImporter.prototype.extractPhotos = function(url, options, callback) {
  var self = this;

  console.log('extractPhotos');

  self.downloadPage(url, options, function(err, result) {
    if (err) {
      console.log('downloadPage: failed.');
      console.log(err);
      return callback(err);
    }

    console.log('downloadPage: done.');

    if (!result.html && !result.$) {
      return callback(new Error('Invalid HTML'));
    }

    var $ = result.$ || cheerio.load(result.html);

    var page = {
      url: url
    };

    var images = getImages($, page, '.GrowthUnauthPinImage');
    images.forEach(function(image) {
      image.src = utils.replaceAll(image.src, '/736x/', '/originals/');
    });

    callback(null, images);
  });
}
