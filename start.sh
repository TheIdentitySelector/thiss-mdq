#!/bin/sh

exec nodemon -e json --watch $METADATA ./index.js
