// Add custom JS here
$(function () {
  $('[data-toggle="tooltip"]').tooltip()
});

$(function(){
    $("[data-toggle=popover]").popover({
        html : true,
        content: function() {
          var content = $(this).attr("data-popover-content");
          return $(content).children(".popover-body").html();
        },
        title: function() {
          var title = $(this).attr("data-popover-content");
          return $(title).children(".popover-heading").html();
        }
    });
});

$('.popover-dismiss').popover({
  trigger: 'focus'
});

$(function() {
    fetch('footer.html')
  .then(function(response) {
    if (!response.ok) throw new Error('Footer could not load: ' + response.status);
    return response.text();
  })
  .then(function(html) {
    var footer = document.getElementById('footer');
    if (footer) footer.innerHTML = html;
  })
  .catch(function(error) { console.error(error); });
});

/*// Wait for the web page to be ready
$(document).ready(function() {
  // grab all thumbnails and add bootstrap popovers
  // https://getbootstrap.com/javascript/#popovers
  $('[data-toggle="popover"]').popover({
    container: 'body',
    html: true,
    placement: 'auto',
    trigger: 'hover',
    content: function() {
      // get the url for the full size img
      var url = $(this).data('full');
      return '<img src="' + url + '">'
    }
  });
});*/
