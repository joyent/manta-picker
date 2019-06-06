#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2019 Joyent, Inc.
#

NAME = picker 

JSON_FILES =		package.json
JS_FILES :=		$(shell find lib test -name '*.js')
SMF_MANIFESTS_IN =	smf/manifests/bapi.xml.in

NODE_PREBUILT_VERSION =	v6.17.0
NODE_PREBUILT_TAG = zone64
NODE_PREBUILT_IMAGE=c2c31b00-1d60-11e9-9a77-ff9f06554b0f

RELEASE_TARBALL:= $(NAME)-pkg-$(STAMP).tar.gz
RELSTAGEDIR       := /tmp/$(NAME)-$(STAMP)

# This image is triton-origin-x86_64-18.4.0
BASE_IMAGE_UUID = a9368831-958e-432d-a031-f8ce6768d190
BUILDIMAGE_NAME = manta-picker
BUILDIMAGE_DESC	= Manta Picker
AGENTS          = amon config registrar
BUILDIMAGE_PKGSRC = 

ENGBLD_USE_BUILDIMAGE   = true
ENGBLD_REQUIRE          := $(shell git submodule update --init deps/eng)
include ./deps/eng/tools/mk/Makefile.defs
TOP ?= $(error Unable to access eng.git submodule Makefiles.)

ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.defs
	include ./deps/eng/tools/mk/Makefile.agent_prebuilt.defs
else
	NPM=npm
	NODE=node
	NPM_EXEC=$(shell which npm)
	NODE_EXEC=$(shell which node)
endif
include ./deps/eng/tools/mk/Makefile.smf.defs
include ./deps/eng/tools/mk/Makefile.node_modules.defs


#
# Repo-specific targets
#

.PHONY: all
all: $(SMF_MANIFESTS) $(STAMP_NODE_MODULES)

.PHONY: release
release:
	echo "Do work here, perhaps start by copying muskie or others"


#
# Included target definitions.
#

include ./deps/eng/tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.targ
	include ./deps/eng/tools/mk/Makefile.agent_prebuilt.targ
endif
include ./deps/eng/tools/mk/Makefile.smf.targ
include ./deps/eng/tools/mk/Makefile.node_modules.targ
include ./deps/eng/tools/mk/Makefile.targ
