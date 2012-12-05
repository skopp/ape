
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

    $ git clone https://github.com/firebase/ape.git
    $ $EDITOR ape/ape.js // Change APE_PATH to the path where you intend to host.
    $ $BROWSER $APE_PATH/index.html // Serve off http or https for best results.

License
-------
All code in this repository is subject to the following license terms. No part
of this project may be copied, modified, propagated, or distributed except
according to the following terms.

Copyright (c) 2012, Firebase.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
