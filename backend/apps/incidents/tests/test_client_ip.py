from django.test import RequestFactory, override_settings

from apps.incidents.api.views import client_ip

rf = RequestFactory()


@override_settings(CLIENT_IP_HEADER="HTTP_CF_CONNECTING_IP", TRUSTED_PROXY_COUNT=0)
def test_edge_header_wins_over_spoofed_forwarded_for():
    req = rf.get("/", HTTP_CF_CONNECTING_IP="198.51.100.7", HTTP_X_FORWARDED_FOR="6.6.6.6", REMOTE_ADDR="10.0.0.1")
    assert client_ip(req) == "198.51.100.7"


@override_settings(CLIENT_IP_HEADER="HTTP_CF_CONNECTING_IP", TRUSTED_PROXY_COUNT=0)
def test_missing_edge_header_falls_back_to_remote_addr():
    req = rf.get("/", HTTP_X_FORWARDED_FOR="6.6.6.6", REMOTE_ADDR="10.0.0.1")
    assert client_ip(req) == "10.0.0.1"


@override_settings(CLIENT_IP_HEADER="", TRUSTED_PROXY_COUNT=1)
def test_trusted_proxy_count_still_works():
    req = rf.get("/", HTTP_X_FORWARDED_FOR="6.6.6.6, 198.51.100.7", REMOTE_ADDR="10.0.0.1")
    assert client_ip(req) == "198.51.100.7"


@override_settings(ALLOWED_HOSTS=["api.example.com"], SECURE_SSL_REDIRECT=True)
def test_healthz_skips_host_check_and_https_redirect(client):
    res = client.get("/healthz", HTTP_HOST="10.1.2.3:10000")
    assert res.status_code == 200
    assert res.content == b"ok"
