// routes/stats.js

var async = require('async');
var moment = require('moment');

var db = require('../db');

// GET /stats?output=count[&collections_count=1][&folders_count=1][&photos_count=1][&favorites_count=1]
// GET /stats?output=tag
// GET /stats?output=date&from=...&to=...&scope=... (scope: 'year', 'month', 'day')
exports.getStats = function(req, res, next) {

  var condition = {};
  var options = {};

  if (req.query.skip) {
    options.skip = parseInt(req.query.skip);
  }
  if (req.query.limit) {
    options.limit = parseInt(req.query.limit);
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

  if (req.query.output == 'tag') {
    options.sort = options.sort || {count: -1};

    db.getPhotoTagStats(condition, options, function(err, result) {
      if (err) return next(err);
      res.json({
        total: result.count,
        skip: options.skip,
        limit: result.limit,
        tags: result.tags
      });
    });
  } else if (req.query.output == 'date') {
    options.sort = options.sort || {date: -1};

    if (req.query.after || req.query.before) {
      var time_filter = {};
      if (req.query.after) {
        var time_after = parseInt(req.query.after);
        if (!isNaN(time_after)) {
          time_filter.$gte = moment(new Date(time_after)).toJSON();
        }
      }
      if (req.query.before) {
        var time_before = parseInt(req.query.before);
        if (!isNaN(time_before)) {
          time_filter.$lte = moment(new Date(time_before)).toJSON();
        }
      }
      condition.date = time_filter;
    }
    if (req.query.scope) condition.scope = req.query.scope;

    db.getPhotoDateStats(condition, options, function(err, result) {
      if (err) return next(err);

      res.json({
        total: result.count,
        skip: options.skip,
        limit: result.limit,
        dates: result.dates
      });
    });
  } else if (req.query.output == 'count') {
    async.series({
      collections_count: function(cb) {
        if (req.query.collections_count) return db.getCollectionCount({}, cb);
        else cb();
      },
      folders_count: function(cb) {
        if (req.query.folders_count) return db.getFolderCount({}, cb);
        else cb();
      },
      photos_count: function(cb) {
        if (req.query.photos_count) return db.getPhotoCount({}, cb);
        else cb();
      },
      favorites_count: function(cb) {
        if (req.query.favorites_count) return db.getFavoritesCount({}, cb);
        else cb();
      }
    }, function(err, result) {
      if (err) return next(err);

      res.json(result);
    });
  } else {
    res.json({
      query: req.query
    });
  }
}
