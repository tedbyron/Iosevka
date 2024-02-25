#!/usr/bin/env bash
# Requires fontforge and python3.

for file in ./dist/curlio/TTF/*.ttf; do
	python3 ./FontPatcher/font-patcher -s -l -c --careful --name curlio -out dist/patched "$file"
done
