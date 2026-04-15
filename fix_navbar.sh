#!/bin/bash

cd /home/node/.openclaw/workspace/projects/ALD-Invoicing-WebApp

# Backup the file
cp landing.html landing.html.bak

# Replace the navbar CSS block
sed -i '/\/\* Navbar \*\//,/^        \.navbar-brand img {/c\
        /* Navbar */\
        .navbar {\
            background-color: #ffffff !important;\
            border-bottom: 2px solid #eef4fb;\
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);\
            padding: 0 !important;\
            min-height: 0 !important;\
            overflow: visible;\
        }\
        \
        .navbar .container {\
            min-height: 0 !important;\
            padding-top: 2px !important;\
            padding-bottom: 2px !important;\
        }\
        .navbar-nav .nav-link {\
            padding-top: 4px !important;\
            padding-bottom: 4px !important;\
        }\
        \
        .navbar-brand img {\
            height: 120px;\
            width: auto;\
            position: relative;\
            z-index: 10;\
        }' landing.html

# Add, commit and push
git add landing.html
git commit -m "Landing: force minimal navbar height, override Bootstrap defaults"
git push