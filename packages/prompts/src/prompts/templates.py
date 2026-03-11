"""Backward-compatible render_template helper.

New code should use ``render_prompt`` from the registry instead::

    from prompts import render_prompt
    text = render_prompt("chat", context={"user_name": "Ada"})
"""

from .registry import render_prompt


def render_template(name: str, context: dict | None = None) -> str:
    """Render a prompt template by filename.

    Accepts the legacy ``{name}.j2`` form and resolves it to the latest
    versioned template (e.g. ``"chat.j2"`` → latest ``chat.vN.j2``).

    .. deprecated::
        Use :func:`prompts.render_prompt` instead.
    """
    # Strip the .j2 suffix to get the prompt name
    prompt_name = name.removesuffix(".j2")
    return render_prompt(prompt_name, context=context)
