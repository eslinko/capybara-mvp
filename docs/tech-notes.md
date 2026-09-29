Avatar paths are not hardcoded in UI.

Avatar asset locations are configured through environment variables.

Example:

CAPY_CHILD_TRISTAN_AVATAR=/assets/avatars/tristan.png

CAPY_CHILD_BASTIAN_AVATAR=/assets/avatars/bastian.png

This decision intentionally keeps the frontend independent from a fixed family model.

Future multi-family support will move these values into the database without requiring UI redesign.