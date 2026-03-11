from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_templates_dir = Path(__file__).parent / "system"

_env = Environment(
    loader=FileSystemLoader(str(_templates_dir)),
    autoescape=select_autoescape(enabled_extensions=()),
    trim_blocks=True,
    lstrip_blocks=True,
)


def render_template(name: str, context: dict | None = None) -> str:
    """Render a Jinja2 template from the system prompts directory.

    Args:
        name: Template filename relative to prompts/system/ (e.g. "chat.j2")
        context: Variables to inject into the template.
    """
    template = _env.get_template(name)
    return template.render(**(context or {}))
