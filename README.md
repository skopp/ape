
Ape
===

Ape is currently intended to be used as a bookmarklet to share your current
page to other viewers. It is a heavily modified version of
[BrowserMirror](https://github.com/mozilla/browsermirror/) that uses
[Firebase](http://www.firebase.com) to power the server side pieces.

Sharing pages is always one-way, and no actions performed by any viewer will
affect the page. All (visible) changes to the page that happen on the
broadcasting side will show up for every viewer.

Quick Start
-----------

    $ git clone git@github.com:mozilla/browsermirror.git
    $ $EDITOR ape.js // Change APE_PATH to the path where you intend to host.
    $ $BROWSER $APE_PATH/index.html // Serve off http or https for best results.
