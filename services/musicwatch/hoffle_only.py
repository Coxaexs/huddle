"""Starts the music bot, with or without Discord.

music.py refuses to start without DISCORD_TOKEN. For a Hoffle-only server
there is no Discord bot to log in, so in that case the Discord login is
replaced with a wait: the dashboard, the DJ booth, Watch Together and Hoffle's
voice rooms all start exactly as they would next to Discord.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.getcwd())

import music  # noqa: E402


async def _without_discord(_token):
    music.logger.info("No DISCORD_TOKEN set: running for Hoffle only.")
    await asyncio.Event().wait()


if not music.config.DISCORD_TOKEN:
    music.bot.start = _without_discord

asyncio.run(music.main())
