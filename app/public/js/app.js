angular.module('MyPhotos', 
  [ 
    'ui.bootstrap', 
    'ngSanitize', 
    'angular-growl', 
    'infinite-scroll', 
    'btford.socket-io',
    'MyPhotos.controllers.main',
    'MyPhotos.services.db',
    'MyPhotos.services.import'
  ])
  .filter('encodeURI', function() {
    return window.encodeURIComponent;
  })
  .filter('domain', function () {
    return function (input) {
      var matches,
          output = "",
          urls = /\w+:\/\/([\w|\.]+)/;
      matches = urls.exec( input );
      if ( matches !== null ) output = matches[1];
      output = output.replace('www.','');
      return output;
    };
  })
  .filter('formatBytes', function() {
    return function(bytes) {
      if (bytes == 0) return '0 Byte';
      var k = 1000;
      var decimals = 2;
      var dm = decimals + 1 || 3;
      var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toPrecision(dm) + ' ' + sizes[i];
    };
  })
  .filter('trim', function() {
    return function(value, length) {
      if(!angular.isString(value)) {
          return value;
      }
      length = length || 60;
      return (value.length > length) ? (value.substring(0,length) + '...') : value;
    };
  })
  .config(['growlProvider', function (growlProvider) {
    growlProvider.globalTimeToLive(3000);
    growlProvider.globalDisableIcons(true);
    growlProvider.globalDisableCountDown(true);
    growlProvider.globalPosition('bottom-left');
  }])
  .directive('onErrorSrc', function() {
    return {
      link: function(scope, element, attrs) {
        element.bind('error', function() {
          if (attrs.src != attrs.onErrorSrc) {
            attrs.$set('src', attrs.onErrorSrc);
          }
        });
      }
    }
  })
  .directive('inputfile', function() {
    return {
      restrict: 'E',
      template: '<input type="file"/>',
      replace: true,
      require: 'ngModel',
      link: function(scope, element, attr, ctrl) {
        var listener = function() {
          scope.$apply(function() {
            if (attr.multiple) {
              ctrl.$setViewValue(element[0].files)
            } else if (attr.nwdirectory) {
              ctrl.$setViewValue(element[0].files[0].path);
            } else {
              ctrl.$setViewValue(element[0].files[0]);
            }
          });
        }
        element.bind('change', listener);
      }
    }
  })
  .directive('imageonload', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            scope.photoLoading = true;
            element.bind('load', function() {
                scope.photoLoading = false;
            });
            element.bind('error', function(){
                scope.photoLoading = false;
            });
        }
    };
  })
  .factory('socketIo', function (socketFactory) {
    return socketFactory();
  })
  ;

