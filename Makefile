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
SMF_MANIFESTS_IN =	smf/manifests/picker.xml.in

## Added by Rui
JSSTYLE_FILES = $(JS_FILES)
ESLINT_FILES = $(JS_FILES)
## /Added by Rui

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

## TODO: [RUI] not sure if I need this.
.PHONY: manta-scripts                                                 
manta-scripts: deps/manta-scripts/.git                                
	mkdir -p $(BUILD)/scripts                                         
	cp deps/manta-scripts/*.sh $(BUILD)/scripts  

.PHONY: all
all: $(SMF_MANIFESTS) $(STAMP_NODE_MODULES)

.PHONY: release
release: all
	@echo "Building $(RELEASE_TARBALL)"                               
	@mkdir -p $(RELSTAGEDIR)/root/opt/smartdc/$(NAME)                 
	@mkdir -p $(RELSTAGEDIR)/root/opt/smartdc/boot                    
	@mkdir -p $(RELSTAGEDIR)/site                                     
	@touch $(RELSTAGEDIR)/site/.do-not-delete-me                      
	@mkdir -p $(RELSTAGEDIR)/root                                     
	@mkdir -p $(RELSTAGEDIR)/root/opt/smartdc/$(NAME)/etc             
	cp -r \                                                           
	    $(ROOT)/build \                                               
	    $(ROOT)/bin \                                                 
	    $(ROOT)/boot \                                                
	    $(ROOT)/main.js \                                             
	    $(ROOT)/lib \                                                 
	    $(ROOT)/node_modules \                                        
	    $(ROOT)/package.json \                                        
	    $(ROOT)/sapi_manifests \                                      
	    $(ROOT)/smf \                                                 
	    $(ROOT)/test \                                                
	    $(RELSTAGEDIR)/root/opt/smartdc/$(NAME)                       
	mv $(RELSTAGEDIR)/root/opt/smartdc/$(NAME)/build/scripts \        
	    $(RELSTAGEDIR)/root/opt/smartdc/$(NAME)/boot                  
	ln -s /opt/smartdc/$(NAME)/boot/setup.sh \                        
	    $(RELSTAGEDIR)/root/opt/smartdc/boot/setup.sh                 
	chmod 755 $(RELSTAGEDIR)/root/opt/smartdc/$(NAME)/boot/setup.sh   
	cd $(RELSTAGEDIR) && $(TAR) -I pigz -cf $(ROOT)/$(RELEASE_TARBALL) root site
	@rm -rf $(RELSTAGEDIR)   


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
