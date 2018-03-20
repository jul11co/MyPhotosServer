// routes/collections.js

var async = require('async');
var moment = require('moment');

var config = require('../config');
var db = require('../db');
var utils = require('../utils');

// Collections is dynamic sets of photos
// A collection can gather photos from folders or individual photos

// GET /collections
// GET /collections?skip=...&limit=...
exports.getCollections = function(req, res, next) {
  var options = {};
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
  db.getCollectionCount({}, function(err, count) {
    if (err) return next(err);

    db.getRecentAddedCollections(options, function(err, collections) {
      if (err) return next(err);

      config.fixCollectionCoverPaths(collections);

      res.json({
        query: req.query,
        total: count,
        skip: options.skip,
        limit: options.limit,
        collections: collections
      });
    });
  });
}

exports.getCollectionsCount = function(req, res, next) {
  db.getCollectionCount({}, function(err, count) {
    if (err) return next(err);
    res.json({count: count});
  });
}

// POST /collections
// req.body
// {
//   name: String,
//   description: String,
//   tags: [String],
// }
exports.addCollection = function(req, res, next) {
  db.addCollection(req.body, function(err, newMag) {
    if (err) return next(err);
    res.json(newMag);
  });
}

// GET /collections/search?q=...
exports.searchCollections = function(req, res, next) {
  var layout = (req.query.inplace=='1')?false:'layout';
  if (typeof req.query.q == 'undefined' || req.query.q == '') {
    return next(new Error('Missing query'));
  }

  var condition = utils.buildSearchCondition(req.query);

  var options = {};
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
  } else {
    options.sort = {added_at: -1};
  }

  db.findCollections(condition, options, function(err, result) {
    if (err) return next(err);

    config.fixCollectionCoverPaths(result.collections);

    res.json({
      total: result.count,
      skip: options.skip,
      limit: result.limit,
      collections: result.collections
    });
  });
}

// GET /collections/:collection_id
// GET /collections/:collection_id?with_photos=...[&skip=...][&limit=...][&sort=...][&before=...][&after=...]
exports.getCollection = function(req, res, next) {
  db.getCollection({_id: req.params.collection_id}, function(err, collection) {
    if (err) return next(err);
    if (!collection) {
      return next(new Error('The collection is not available'));
    }
    
    config.fixCollectionCoverPaths([collection]);

    // if (!collection.cover || typeof collection.photos_count == 'undefined') {
    //   db.updatePhotoCollection(req.params.collection_id, function(err) {
    //     if (err) console.log(err);
    //   });
    // }

    if (req.query.with_photos == '1') {

      var options = {};
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
      } else {
        options.sort = {created: -1};
      }

      var condition = {
        collections: req.params.collection_id
      };

      if (req.query.after || req.query.before) {
        var time_filter = {};
        if (req.query.after) {
          var time_after = parseInt(req.query.after);
          if (!isNaN(time_after)) {
            time_filter.$gt = moment(new Date(time_after)).toDate().getTime();
          }
        }
        if (req.query.before) {
          var time_before = parseInt(req.query.before);
          if (!isNaN(time_before)) {
            time_filter.$lt = moment(new Date(time_before)).toDate().getTime();
          }
        }
        if (req.query.sort == '-added_at') {
          condition.added_at = time_filter;
        } else { // created
          condition.created = time_filter;
        }
      }

      options.populate_collections = true;

      db.getPhotos(condition, options, function(err, photos) {
        if (err) return next(err);

        config.fixPhotoPaths(photos);

        res.json({
          query: req.query,
          total: collection.photos_count,
          skip: options.skip,
          limit: options.limit,
          collection: collection,
          photos: photos
        });
      });
    } else {
      res.json(collection);
    }
  });
}

// GET /collections/:collection_id/delete
// GET /collections/:collection_id/delete?with_photos=1
exports.deleteCollection = function(req, res, next) {
  db.getCollection({_id: req.params.collection_id}, function(err, collection) {
    if (err) return next(err);
    if (!collection) {
      return next(new Error('The collection is not available'));
    }

    if (req.query.with_photos == '1') {
      // remove related collection photos
      db.removePhoto({collections: req.params.collection_id}, {multi: true}, function(err, numRemoved) {
        if (err) return next(err);

        var photosRemoved = numRemoved;

        // remove itself
        db.removeCollection({_id: req.params.collection_id}, function(err, numRemoved) {
          if (err) return next(err);

          res.json({
            success: true,
            photosRemoved: photosRemoved,
            message: 'Collection: "' + collection.name + '" has been deleted (with ' + photosRemoved + ' photos removed)'
          });
        });
      });
    } else {
      db.removeCollection({_id: req.params.collection_id}, function(err, numRemoved) {
        if (err) return next(err);

        res.json({
          success: true,
          photosRemoved: 0,
          message: 'Collection: "' + collection.name + '" has been deleted (with ' + 0 + ' photos removed)'
        });
      });
    }
  });
}
