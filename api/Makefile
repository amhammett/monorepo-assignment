
os_python := python3.7
venv_python := ./venv/bin/python
venv_lambda_gateway := ./venv/bin/lambda-gateway

venv:
	${os_python} -m pip install virtualenv
	${os_python} -m virtualenv venv

install: venv
	${venv_python} -m pip install -r requirements.txt

local-server: install
	${venv_lambda_gateway} -p 3001 callbackcode.handler

