# Copyright (C) 2019 The Android Open Source Project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
PROTOC = protoc
PROTOC_CMD = which $(PROTOC)
PYTHON = python
NPM ?= npm

HAS_PROTOC = $(shell $(PROTOC_CMD) > /dev/null && echo true || echo false)

PREFIX_ESLINT = $(PYTHON) eslint_prefix.py

MAKEFILE_PATH := $(abspath $(lastword $(MAKEFILE_LIST)))
CURRENT_DIR :=  $(abspath $(MAKEFILE_PATH)/..)
PROTODIR 	  := $(CURRENT_DIR)/src/proto/
PROTOSRCDIR   := $(CURRENT_DIR)/proto

# We only need emulator_controller.proto to generate message definitions for data channel.
PROTO_SRC     := $(PROTOSRCDIR)/emulator_controller.proto
PROTO_OBJS    := $(PROTODIR)/emulator_controller_pb.js

.PHONY: clean build deps system-check protoc

all: check

clean:
	rm -rf $(PROTODIR)/*pb.js
	rm -rf dist

$(PROTODIR):
	@mkdir -p $(PROTODIR)

# Compile proto to JS.
# Note: we use protoc-gen-js which is installed via npm.
# We make sure node_modules/.bin is in PATH.
$(PROTODIR)/%_pb.js : $(PROTOSRCDIR)/%.proto $(PROTODIR)
	PATH=$(CURRENT_DIR)/node_modules/.bin:$$PATH $(PROTOC) \
	        -I/usr/local/include -I$(PROTODIR) -I$(PROTOSRCDIR) \
			--js_out=import_style=commonjs,binary:$(PROTODIR) \
			$<
	$(PREFIX_ESLINT) $@

# We need node_modules to run protoc-gen-js (if it is installed via npm)
deps: system-check
	@$(NPM) install

protoc: deps $(PROTO_OBJS)

build: deps protoc
	@$(NPM) run build

check: build
	@$(NPM) run test

system-check:
ifneq ($(HAS_PROTOC),true)
	@echo " DEPENDENCY ERROR"
	@echo
	@echo "You don't have protoc installed in your path."
	@echo "Please install Google protocol buffers compiler."
	@echo "   or try $ brew install protobuf"
	@echo "   or sudo apt-get install protobuf-compiler"
	@echo
endif
