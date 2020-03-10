VERSION:=1.1.3
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
