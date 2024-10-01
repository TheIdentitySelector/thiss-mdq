.. JSON MDQ Server documentation master file, created by
   sphinx-quickstart on Wed Aug 14 13:22:09 2019.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

Welcome to JSON MDQ Server's documentation!
===========================================

thiss-mdq is a minimal implementation of the metadata query protocol (MDQ) that only supports JSON data. Metadata in discojson format is loaded from a JSON-file referenced by $METADATA. The file is watched for updates and is reloaded automatically. A server is started on $HOST (0.0.0.0) and $PORT (3000) with $FORK number of processes (if $FORK is not provided, it will spawn as many processes as CPUs are detected). Run it using "npm start" or the supplied Docker container.

.. toctree::
   :maxdepth: 2
   :caption: Contents:
   
   install
   api
   releasenotes


Indices and tables
==================

* :ref:`genindex`
* :ref:`search`
