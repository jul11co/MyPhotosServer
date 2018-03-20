// routes/photos.js

var async = require('async');
var moment = require('moment');

var path = require('path');
var fse = require('fs-extra');

var config = require('../config');
var db = require('../db');
var utils = require('../utils');

// POST /favorites
exports.addToFavorites = function(req, res, next) {
  if (!req.body.item_type || !req.body.item_id) {
    return res.status(401).json({
      error: 'Invalid request (missing item_type or item_id)'
    });
  }
  db.addToFavorites({
    item_type: req.body.item_type, 
    item_id: req.body.item_id
  }, function(err, faventry) {
    if (err) return next(err);
    res.json({ok: true, entry: faventry});
  });
}

// GET /favorites/count
exports.getFavoritesCount = function(req, res, next) {
  db.getFavoritesCount({}, function(err, count) {
    if (err) return next(err);
    res.json({count: count});
  });
}

// GET /favorites
// GET /favorites?skip=...&limit=...
// GET /favorites?sort=... // (sort: 'created_date' or 'added_date' or 'name')
exports.getFavorites = function(req, res, next) {

  var options = {};
  var condition = {};

  if (req.query.skip) {
    options.skip = parseInt(req.query.skip);
  }
  if (req.query.limit) {
    options.limit = parseInt(req.query.limit);
  } else {
    options.limit = 30;
  }

  if (req.query.sort_by) {
    options.sort = {};
    if (req.query.sort_order == 'asc') {
      options.sort[req.query.sort_by] = 1;
    } else {
      options.sort[req.query.sort_by] = -1;
    }
  } else if (typeof req.query.sort != 'undefined') {
    options.sort = {};
    if (req.query.sort[0] == '-') {
      var sort = req.query.sort.substring(1);
      options.sort[sort] = -1;
    } else {
      options.sort[req.query.sort] = 1;
    }
  }

  if (req.query.type) options.type = req.query.type;

  // console.log(condition);

  db.getFavorites(options, function(err, result) {
    if (err) return next(err);

    // console.log({total: result.total, count: result.photos.length});

    async.series([
      function(cb) {
        if (result.photos && result.photos.length) {
          db.populatePhotos(result.photos, {
            populate_collections: true
          }, function(err, photos) {
            if (err) return cb(err);
            config.fixPhotoPaths(result.photos);
            cb();
          });
        } else {
          cb();
        }
      },
      function(cb) {
        if (result.folders && result.folders.length) {
          config.fixFolderPaths(result.folders);
          cb();
        } else {
          cb();
        }
      },
      function(cb) {
        if (result.collections && result.collections.length) {
          config.fixCollectionCoverPaths(result.collections);
          cb();
        } else {
          cb();
        }
      }
    ], function(err) {
      if (err) return next(err);

      res.json({
        query: req.query,
        total: result.total,
        skip: result.skip,
        limit: result.limit,
        photos: result.photos,
        folders: result.folders,
        collections: result.collections
      });
    });
  });
}

// GET /favorites/:entry_id
exports.getFavorite =function(req, res, next) {
  db.getFavoriteEntry(req.params.entry_id, function(err, faventry) {
    if (err) return next(err);
    if (!faventry) {
      return next(new Error('The favorite entry is not available'));
    }
    res.json(faventry);
  });
}

// DELETE /favorites/:entry_id
exports.removeFavorite = function(req, res, next) {
  db.getFavoriteEntry(req.params.entry_id, function(err, favEntry) {
    if (err) return next(err);
    if (!favEntry) {
      return next(new Error('The favorite entry is not available'));
    }
    db.removeFromFavorites({_id: req.params.entry_id}, function(err) {
      if (err) return next(err);
      res.json({
        success: true,
        message: 'Favorite entry "' + req.params.entry_id + '" has been removed'
      });
    });
  });
}
