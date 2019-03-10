A minimal JSON-only MDQ server with search capability
===

thiss-mdq is a minimal implementation of MDQ that only supports JSON data. Metadata in discojson format is loaded from a JSON-file referenced by $METADATA. The file is watched for updates and is reloaded automatically. A server is started on $HOST (0.0.0.0) and $PORT (3000). Run it using "npm start" or the supplied Docker container.
