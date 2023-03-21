#!/usr/bin/env zsh
# requires fontforge

for file in ./dist/curlio/ttf/*(.); do
	python3 ./FontPatcher/font-patcher -s -l -c --careful -out dist/patched $file
done
