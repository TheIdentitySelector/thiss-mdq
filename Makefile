VERSION:=$(shell jq -r .version package.json)
NAME:=thiss-mdq

all: build push
build:
	docker build --no-cache=true -t $(NAME) .
	docker tag $(NAME) docker.sunet.se/$(NAME):$(VERSION)
dev:
	docker build -f Dockerfile.dev --no-cache=true -t $(NAME) .
	docker tag $(NAME) docker.sunet.se/$(NAME):$(VERSION)
update:
	docker build -t $(NAME) .
	docker tag $(NAME) docker.sunet.se/$(NAME):$(VERSION)
push:
	docker push docker.sunet.se/$(NAME):$(VERSION)
