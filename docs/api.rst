API
===

The thiss-mdq server implements the metadata query protocol (MDQ) along with a few extensions.


MDQ
---

The following endpoints are specfied by MDQ (using GET requests)

* ``/entities/`` - returns all JSON metadata in a single array.
* ``/entities/{sha1}<sha1 hash of entityID>`` - returns a single entity in JSON format

The MDQ protocol specifies standard content negotiation but currently the Accept header is ignored and application/json is always returned. This may change in the future and clients should always set the Accept header to include ``application/json``. An optional ".json" efile extension in the URL is ignored.

In addition to these endpoints thiss-mdq supports a couple of extensions:

* Search
* WebFinger
* Monitoring

Search
------

Issue a GET request to ``/entities/?q=<search>``. The result is a (possibly empty) JSON list of entities matching the search query.

Trust Profiles
--------------

Issue a GET request to ``/entities/?entityID=<entityID>&trustProfile=<profile>``.
The result is a (possibly empty) JSON list of entities that conform to the conditions expressed in the trust profile.
It can be combined with a full text search with a GET request to ``/entities/?entityID=<entityID>&trustProfile=<profile>&q=<search>``

WebFinger
---------

Issue a GET request to ``/.well-known/webfinger``. The result is a list of all URIs (all the entities) included in the indexed metadata. This can be used together with curl/wget to mirror the _static_ contents of the mdq instance. It is of course not possible to mirror all possible searches this way.

Monitoring
----------

Issue a GET or HEAD request to ``/status``. The result is a 200 if the metadata index is alive an well and 500 otherwize.
