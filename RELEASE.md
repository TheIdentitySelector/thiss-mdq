
To release a new version:
=========================

* Tests pass
* Update ``docs/``, in particular ``docs/releasenotes.rst``
* Bump version using ``tbump``:

    ```bash
    $ tbump <new version>
    ```
* Publish to npmjs

To use tbump
------------

tbump will update the version in ``package.json`` and ``docs/conf.py``, commit the changes, create a new tag, and push it all to the origin remote.
Check ``tbump.toml`` in the root of the repo for configuration.

Make a virtualenv with whatever method, install tbump, use it:

    ```bash
    $ python -m venv venv
    $ . venv/bin/activate
    $ pip install tbump
    $ tbump <new version>
    ```
