"""Tests for guest chat flow."""


def test_guest_user_id_derived_from_ip():
    from api.routers.chat import _guest_user_from_ip

    user = _guest_user_from_ip("192.168.1.100")
    assert user.id == "guest:192.168.1.100"
    assert user.email == "guest@anonymous"
    assert _guest_user_from_ip("192.168.1.100").id == _guest_user_from_ip("192.168.1.100").id
