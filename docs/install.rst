Installing  and Running thiss-mdq
=================================

The recommended way to install thiss-mdq is via docker using the supplied Dockerfile:

.. code-block:: bash

  # docker build -t thiss-mdq:latest

The docker-image can be run thus:

.. code-block:: bash

  # docker run -d -p 3000:3000 -v /some/where/metadata.json:/etc/metadata.json thiss-mdq:latest

Verify that the container has started by cURL:ing:

.. code-block:: bash

  # curl -s http://localhost:3000/ 

The result should include information about the version of thiss-mdq and the number of entities in the metadata set. 

There are two backend options: the default lunr-based backend and the redis backend. Setting the environment varialble INDEXER to 'redis' turns on the latter.
