angular.module('MyPhotos.services.import', [])
  .factory('importService', [
    '$rootScope', '$http', '$httpParamSerializer', 'socketIo', 
    function($rootScope, $http, $httpParamSerializer, socketIo) {
    
    socketIo.on('error', function(data) {
      console.log(data);
    });

    socketIo.on('importer-queue', function(data) {
      $rootScope.$broadcast('importer-queue', data);
    });
    socketIo.on('importer-processing', function(data) {
      $rootScope.$broadcast('importer-processing', data);
    });
    socketIo.on('importer-removed', function(data) {
      $rootScope.$broadcast('importer-removed', data);
    });

    socketIo.on('importer-started', function(data) {
      $rootScope.$broadcast('importer-started', data);
    });
    socketIo.on('importer-progress', function(data) {
      $rootScope.$broadcast('importer-progress', data);
    });
    socketIo.on('importer-imported', function(data) {
      $rootScope.$broadcast('importer-imported', data);
    });
    socketIo.on('importer-error', function(error) {
      $rootScope.$broadcast('importer-error', data);
    });
    socketIo.on('importer-stopped', function(data) {
      $rootScope.$broadcast('importer-stopped', data);
    });
    socketIo.on('importer-log', function(data) {
      $rootScope.$broadcast('importer-log', data);
    });

    var service = {

      browseFiles: function(path, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        var querystring = $httpParamSerializer(options);

        $http.get('/filebrowser?path=' + encodeURIComponent(path) + '&' + querystring)
        .then(function(response) {
          // this callback will be called asynchronously
          // when the response is available
          callback(null, response.data);
        }, function(response) {
          console.log(response);
          callback(response);
        });
      },
      
      startImport: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};
        callback = callback || function(err) {};

        socketIo.emit('start-import', {options: options});

        callback();
      },

      stopImport: function() {
        socketIo.emit('stop-import');
      },

      removeImport: function(timestamp) {
        socketIo.emit('remove-import', {timestamp: timestamp});
      }

    };

    return service;
  }]);