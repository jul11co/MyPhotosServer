// routes/filebrowser.js

var fs = require('fs');
var path = require('path');

var async = require('async');

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

// GET /filebrowser?path=...
// GET /filebrowser?path=...&type=files
// GET /filebrowser?path=...&type=folders
exports.browsePath = function(req, res, next) {
  if (!req.query.path) {
    return res.json({error: "Missing path"});
  }

  var abs_path = path.resolve(req.query.path);
  if (req.query.path == 'HOME') {
    abs_path = getUserHome();
  }
  if (!fs.existsSync(abs_path)) {
    if (fs.existsSync(getUserHome())) {
      abs_path = getUserHome();
    } else {
      abs_path = '/';
    }
  }

  fs.readdir(abs_path, function(err, files) {
    if (err) return next(err);
    
    var filelist = [];
    async.eachSeries(files, function(file, cb) {
      
      // if (file.indexOf('.') == 0) { // ignore hidden files or folders
      //   return cb();
      // }

      var file_abs_path = path.join(abs_path, file);

      var stats = undefined;
      try {
        stats = fs.lstatSync(file_abs_path);
      } catch(e) {
        console.log(e);
        return cb();
      }
      if (!stats) return cb();
      
      if (stats.isFile() && (!req.query.type || req.query.type=='files')) {
        var file_type = path.extname(file).replace('.','');
        
        var file_info = {
          path: file_abs_path,
          name: file,
          type: 'file/' + file_type,
          stats: stats
        };

        filelist.push(file_info);
        cb();
      } else if (stats.isDirectory() && (!req.query.type || req.query.type=='folders')) {
        
        filelist.push({
          path: file_abs_path,
          name: file,
          type: 'folder',
          stats: stats
        });

        cb();

      } else {
        cb();
      }
    }, function(err) {
      
        res.json({
          path: abs_path,
          files: filelist
        });
    });
  });
}
