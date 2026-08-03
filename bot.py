#!/usr/bin/env python3
# =============================================================
# DISCORD MUSIC BOT - F-SOCIETY (FORMAT FIXED)
# =============================================================
# - Updated yt-dlp format selection
# - Uses available audio formats
# - Auto-joins voice channel on .play
# - F-Society branding
# =============================================================

import discord
from discord.ext import commands
import asyncio
import yt_dlp
import os
import datetime
import sys
import random
import logging

# Suppress warnings
import warnings
warnings.filterwarnings('ignore')

# =============================================================
# LOGGING
# =============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('F-Society-Music')

# =============================================================
# CONFIGURATION
# =============================================================

BOT_TOKEN = os.environ.get('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
DEFAULT_VOLUME = float(os.environ.get('DEFAULT_VOLUME', '0.5'))

# =============================================================
# YT-DLP OPTIONS (FIXED FORMAT)
# =============================================================

FFMPEG_OPTIONS = {
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
    'options': f'-vn -filter:a "volume={DEFAULT_VOLUME}"'
}

YDL_OPTIONS = {
    'format': 'bestaudio[ext=m4a]/bestaudio/best',  # Try m4a first, then any audio
    'extractaudio': True,
    'audioformat': 'mp3',
    'outtmpl': '%(extractor)s-%(id)s-%(title)s.%(ext)s',
    'restrictfilenames': True,
    'noplaylist': True,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'auto',
    'source_address': '0.0.0.0',
    'cookiefile': 'cookies.txt',
    'extractor_args': {
        'youtube': {
            'player_client': ['android', 'web'],
            'skip': ['dash', 'hls'],
        }
    },
    'geo_bypass': True,
    'geo_bypass_country': 'US',
}

# =============================================================
# DISCORD BOT
# =============================================================

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.voice_states = True

bot = commands.Bot(command_prefix='.', intents=intents)

# Music state
music_state = {}

# =============================================================
# VOICE FUNCTIONS
# =============================================================

def get_user_voice_channel(ctx):
    if not ctx.author.voice:
        return None
    return ctx.author.voice.channel

async def ensure_voice_connected(ctx):
    channel = get_user_voice_channel(ctx)
    if not channel:
        return None, "❌ You need to be in a voice channel first!"
    
    if ctx.voice_client is None:
        await channel.connect()
        return channel, f"🔊 Joined **{channel.name}**"
    elif ctx.voice_client.channel != channel:
        await ctx.voice_client.move_to(channel)
        return channel, f"🔊 Moved to **{channel.name}**"
    else:
        return channel, f"🔊 Already in **{channel.name}**"

async def leave_voice(ctx):
    if ctx.voice_client:
        guild_id = ctx.guild.id
        if guild_id in music_state:
            music_state[guild_id]['queue'] = []
            music_state[guild_id]['current'] = None
        await ctx.voice_client.disconnect()
        return True
    return False

# =============================================================
# HELPERS
# =============================================================

def format_duration(seconds):
    if not seconds:
        return "Live"
    minutes, seconds = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"

def is_playlist_url(url: str) -> bool:
    if not url:
        return False
    return 'playlist?list=' in url or '&list=' in url

def clean_query(query: str) -> str:
    return query.strip()

# =============================================================
# SONG FUNCTIONS
# =============================================================

async def get_song_info(query: str):
    """Get song info using yt-dlp."""
    logger.info(f"🔍 Searching for: {query}")
    try:
        with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
            search_query = f"ytsearch1:{query}"
            info = ydl.extract_info(search_query, download=False)
            
            if info and info.get('entries'):
                video = info['entries'][0]
                if video:
                    # Get the best available audio URL
                    audio_url = video.get('url')
                    if not audio_url:
                        formats = video.get('formats', [])
                        # Find best audio format
                        for f in formats:
                            if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                                audio_url = f.get('url')
                                break
                        if not audio_url and formats:
                            audio_url = formats[-1].get('url')
                    
                    if not audio_url:
                        logger.warning(f"No audio URL found for: {video.get('title')}")
                        return None
                    
                    logger.info(f"✅ Found: {video.get('title')}")
                    return {
                        'title': video.get('title', 'Unknown'),
                        'url': video.get('webpage_url', ''),
                        'duration': video.get('duration', 0),
                        'thumbnail': video.get('thumbnail', ''),
                        'uploader': video.get('uploader', 'Unknown'),
                        'audio_url': audio_url
                    }
            return None
    except Exception as e:
        logger.error(f"yt-dlp error: {e}")
        return None

async def get_song_info_url(url: str):
    """Get song info from a URL."""
    try:
        with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                return None
            
            audio_url = info.get('url')
            if not audio_url:
                formats = info.get('formats', [])
                for f in formats:
                    if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                        audio_url = f.get('url')
                        break
                if not audio_url and formats:
                    audio_url = formats[-1].get('url')
            
            if not audio_url:
                logger.warning(f"No audio URL found for: {info.get('title')}")
                return None
            
            return {
                'title': info.get('title', 'Unknown'),
                'url': info.get('webpage_url', ''),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', 'Unknown'),
                'audio_url': audio_url
            }
    except Exception as e:
        logger.error(f"Error getting URL info: {e}")
        return None

async def get_playlist_info(url: str):
    """Get playlist info."""
    try:
        with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                return None
            
            if 'entries' in info:
                playlist_name = info.get('title', 'Unknown Playlist')
                songs = []
                
                for entry in info['entries']:
                    if entry:
                        audio_url = entry.get('url')
                        if not audio_url:
                            formats = entry.get('formats', [])
                            for f in formats:
                                if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                                    audio_url = f.get('url')
                                    break
                            if not audio_url and formats:
                                audio_url = formats[-1].get('url')
                        
                        if audio_url:
                            songs.append({
                                'title': entry.get('title', 'Unknown'),
                                'url': entry.get('webpage_url', ''),
                                'duration': entry.get('duration', 0),
                                'thumbnail': entry.get('thumbnail', ''),
                                'uploader': entry.get('uploader', 'Unknown'),
                                'audio_url': audio_url
                            })
                
                return {
                    'is_playlist': True,
                    'name': playlist_name,
                    'songs': songs,
                    'count': len(songs)
                }
            else:
                audio_url = info.get('url')
                if not audio_url:
                    formats = info.get('formats', [])
                    for f in formats:
                        if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                            audio_url = f.get('url')
                            break
                    if not audio_url and formats:
                        audio_url = formats[-1].get('url')
                
                if not audio_url:
                    return None
                
                return {
                    'is_playlist': False,
                    'song': {
                        'title': info.get('title', 'Unknown'),
                        'url': info.get('webpage_url', ''),
                        'duration': info.get('duration', 0),
                        'thumbnail': info.get('thumbnail', ''),
                        'uploader': info.get('uploader', 'Unknown'),
                        'audio_url': audio_url
                    }
                }
    except Exception as e:
        logger.error(f"Error getting playlist info: {e}")
        return None

# =============================================================
# EMBED CREATORS
# =============================================================

async def create_now_playing_embed(song):
    embed = discord.Embed(
        title="🎵 Now Playing",
        description=f"**{song.get('title', 'Unknown')}**",
        color=discord.Color.from_rgb(0, 255, 204),
        timestamp=datetime.datetime.now()
    )
    
    duration = song.get('duration', 0)
    embed.add_field(name="⏱️ Duration", value=format_duration(duration), inline=True)
    embed.add_field(name="👤 Uploader", value=song.get('uploader', 'Unknown'), inline=True)
    
    if song.get('thumbnail'):
        embed.set_thumbnail(url=song.get('thumbnail'))
    
    embed.set_footer(text="developed by @yathishyt ⚡ | F-Society Music")
    return embed

async def create_queue_embed(ctx, guild_id):
    queue_list = music_state[guild_id]['queue']
    current = music_state[guild_id]['current']
    
    embed = discord.Embed(
        title="📋 Music Queue",
        color=discord.Color.from_rgb(0, 255, 204),
        timestamp=datetime.datetime.now()
    )
    
    if current:
        embed.add_field(
            name="🎵 Now Playing",
            value=f"**{current.get('title', 'Unknown')}** ({format_duration(current.get('duration', 0))})",
            inline=False
        )
    
    if queue_list:
        queue_text = ""
        total_duration = 0
        for i, song in enumerate(queue_list[:15], 1):
            title = song.get('title', 'Unknown')
            duration = song.get('duration', 0)
            total_duration += duration
            queue_text += f"`{i}.` **{title}** ({format_duration(duration)})\n"
        
        if len(queue_list) > 15:
            queue_text += f"\n... and {len(queue_list) - 15} more songs"
        
        embed.add_field(
            name=f"⏳ Next Up ({len(queue_list)} songs)",
            value=queue_text,
            inline=False
        )
        
        total_time = format_duration(total_duration)
        embed.add_field(
            name="⏱️ Total Queue Time",
            value=total_time,
            inline=True
        )
    else:
        embed.add_field(name="⏳ Next Up", value="*No songs in queue*", inline=False)
    
    embed.set_footer(text="developed by @yathishyt ⚡ | F-Society Music")
    return embed

# =============================================================
# BOT COMMANDS
# =============================================================

@bot.event
async def on_ready():
    logger.info(f'🎵 F-Society Music Bot online!')
    logger.info(f'🤖 Bot Name: {bot.user.name}')
    logger.info(f'📡 Connected to {len(bot.guilds)} servers')
    logger.info(f'📌 Prefix: .')
    logger.info(f'🔍 Format: bestaudio[ext=m4a]/bestaudio/best')

@bot.command(name='commands')
async def commands_cmd(ctx):
    embed = discord.Embed(
        title="🎵 F-Society Music Bot Commands",
        description="**Voice Control:**\n"
                   "`.play <song/URL/playlist>` - Play a song\n"
                   "`.join` - Join voice channel\n"
                   "`.leave` - Leave voice channel\n\n"
                   "**Playback:**\n"
                   "`.pause` - Pause\n"
                   "`.resume` - Resume\n"
                   "`.skip` - Skip\n"
                   "`.stop` - Stop & clear\n"
                   "`.volume <0-200>` - Set volume\n\n"
                   "**Queue:**\n"
                   "`.queue` - Show queue\n"
                   "`.shuffle` - Shuffle\n"
                   "`.clear` - Clear\n\n"
                   "**Info:**\n"
                   "`.np` - Now playing\n"
                   "`.commands` - This menu",
        color=discord.Color.from_rgb(0, 255, 204),
        timestamp=datetime.datetime.now()
    )
    embed.set_footer(text="developed by @yathishyt ⚡ | F-Society Music")
    await ctx.send(embed=embed)

@bot.command(name='join')
async def join_cmd(ctx):
    channel, message = await ensure_voice_connected(ctx)
    await ctx.send(message if not channel else f"✅ {message}")

@bot.command(name='play', aliases=['p'])
async def play_cmd(ctx, *, query: str):
    channel, join_msg = await ensure_voice_connected(ctx)
    if not channel:
        await ctx.send(join_msg)
        return
    
    guild_id = ctx.guild.id
    if guild_id not in music_state:
        music_state[guild_id] = {
            'queue': [],
            'current': None,
            'volume': DEFAULT_VOLUME,
            'loop': False
        }
    
    query = clean_query(query)
    status_msg = await ctx.send(f"🔍 Searching for `{query}`...\n{join_msg}")
    
    if is_playlist_url(query):
        await status_msg.edit(content=f"📁 Fetching playlist...\n{join_msg}")
        playlist_data = await get_playlist_info(query)
        
        if not playlist_data or not playlist_data.get('is_playlist'):
            await status_msg.edit(content="❌ Could not fetch playlist!")
            return
        
        songs = playlist_data.get('songs', [])
        if not songs:
            await status_msg.edit(content="❌ Playlist is empty or no audio available!")
            return
        
        added = 0
        for song in songs:
            music_state[guild_id]['queue'].append(song)
            added += 1
        
        await status_msg.edit(
            content=f"✅ Added **{added}** songs from playlist `{playlist_data.get('name', 'Unknown')}`!\n{join_msg}"
        )
        
        if not ctx.voice_client.is_playing() and not ctx.voice_client.is_paused():
            await play_next(ctx)
        return
    
    if 'youtube.com/watch' in query or 'youtu.be/' in query:
        await status_msg.edit(content=f"🎵 Fetching song details...\n{join_msg}")
        song_info = await get_song_info_url(query)
        
        if not song_info:
            await status_msg.edit(content="❌ Could not fetch song details!")
            return
        
        music_state[guild_id]['queue'].append(song_info)
        await status_msg.edit(content=f"✅ Added **{song_info.get('title', 'Unknown')}**!\n{join_msg}")
        
        if not ctx.voice_client.is_playing() and not ctx.voice_client.is_paused():
            await play_next(ctx)
        return
    
    await status_msg.edit(content=f"🔍 Searching for `{query}`...\n{join_msg}")
    song_info = await get_song_info(query)
    
    if not song_info:
        await status_msg.edit(content="❌ Could not find that song!")
        return
    
    music_state[guild_id]['queue'].append(song_info)
    await status_msg.edit(content=f"✅ Added **{song_info.get('title', 'Unknown')}**!\n{join_msg}")
    
    if not ctx.voice_client.is_playing() and not ctx.voice_client.is_paused():
        await play_next(ctx)

@bot.command(name='pause')
async def pause_cmd(ctx):
    if not ctx.voice_client or not ctx.voice_client.is_playing():
        await ctx.send("❌ Nothing is playing!")
        return
    ctx.voice_client.pause()
    await ctx.send("⏸️ Paused.")

@bot.command(name='resume')
async def resume_cmd(ctx):
    if not ctx.voice_client or not ctx.voice_client.is_paused():
        await ctx.send("❌ Nothing is paused!")
        return
    ctx.voice_client.resume()
    await ctx.send("▶️ Resumed.")

@bot.command(name='skip')
async def skip_cmd(ctx):
    if not ctx.voice_client:
        await ctx.send("❌ Not in a voice channel!")
        return
    if ctx.voice_client.is_playing():
        ctx.voice_client.stop()
        await ctx.send("⏭️ Skipped.")
    else:
        await ctx.send("❌ Nothing is playing!")

@bot.command(name='stop')
async def stop_cmd(ctx):
    guild_id = ctx.guild.id
    if guild_id in music_state:
        music_state[guild_id]['queue'] = []
        music_state[guild_id]['current'] = None
    if ctx.voice_client and ctx.voice_client.is_playing():
        ctx.voice_client.stop()
    await ctx.send("🛑 Stopped and cleared queue.")

@bot.command(name='queue', aliases=['q'])
async def queue_cmd(ctx):
    guild_id = ctx.guild.id
    if guild_id not in music_state or not music_state[guild_id]['queue']:
        await ctx.send("📭 The queue is empty!")
        return
    
    embed = await create_queue_embed(ctx, guild_id)
    await ctx.send(embed=embed)

@bot.command(name='volume')
async def volume_cmd(ctx, vol: int):
    if not ctx.voice_client:
        await ctx.send("❌ Not in a voice channel!")
        return
    if vol < 0 or vol > 200:
        await ctx.send("❌ Volume must be between 0 and 200!")
        return
    new_volume = vol / 100
    global FFMPEG_OPTIONS
    FFMPEG_OPTIONS['options'] = f'-vn -filter:a "volume={new_volume}"'
    guild_id = ctx.guild.id
    if guild_id in music_state:
        music_state[guild_id]['volume'] = new_volume
    await ctx.send(f"🔊 Volume set to **{vol}%**")

@bot.command(name='np', aliases=['nowplaying'])
async def nowplaying_cmd(ctx):
    guild_id = ctx.guild.id
    if guild_id not in music_state or not music_state[guild_id]['current']:
        await ctx.send("❌ Nothing is playing!")
        return
    current = music_state[guild_id]['current']
    embed = await create_now_playing_embed(current)
    await ctx.send(embed=embed)

@bot.command(name='leave')
async def leave_cmd(ctx):
    if await leave_voice(ctx):
        await ctx.send("👋 Left the voice channel!")
    else:
        await ctx.send("❌ Not in a voice channel!")

@bot.command(name='shuffle')
async def shuffle_cmd(ctx):
    guild_id = ctx.guild.id
    if guild_id not in music_state or not music_state[guild_id]['queue']:
        await ctx.send("📭 The queue is empty!")
        return
    random.shuffle(music_state[guild_id]['queue'])
    await ctx.send("🔀 Queue shuffled!")

@bot.command(name='clear')
async def clear_cmd(ctx):
    guild_id = ctx.guild.id
    if guild_id in music_state:
        music_state[guild_id]['queue'] = []
        await ctx.send("🗑️ Queue cleared!")
    else:
        await ctx.send("📭 The queue is already empty!")

# =============================================================
# MUSIC PLAYER
# =============================================================

async def play_next(ctx):
    guild_id = ctx.guild.id
    
    if guild_id not in music_state or not music_state[guild_id]['queue']:
        if ctx.voice_client:
            await ctx.voice_client.disconnect()
        return
    
    song = music_state[guild_id]['queue'].pop(0)
    music_state[guild_id]['current'] = song
    
    try:
        audio_source = discord.FFmpegPCMAudio(
            song.get('audio_url', song.get('url', '')),
            **FFMPEG_OPTIONS
        )
        
        def after_playing(error):
            if error:
                logger.error(f"Error playing: {error}")
            asyncio.run_coroutine_threadsafe(
                play_next(ctx),
                bot.loop
            )
        
        ctx.voice_client.play(audio_source, after=after_playing)
        
        embed = await create_now_playing_embed(song)
        await ctx.send(embed=embed)
        
    except Exception as e:
        logger.error(f"Error playing: {e}")
        await ctx.send(f"❌ Error playing: {str(e)}")
        await play_next(ctx)

# =============================================================
# ERROR HANDLING
# =============================================================

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CommandNotFound):
        return
    elif isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"❌ Missing argument! Use `.commands`")
    else:
        logger.error(f"Command error: {error}")
        await ctx.send(f"❌ Error: {str(error)}")

# =============================================================
# MAIN
# =============================================================

def main():
    logger.info("🎵 Starting F-Society Music Bot...")
    logger.info("📌 Prefix: .")
    logger.info("🔍 Format: bestaudio[ext=m4a]/bestaudio/best")
    
    if not BOT_TOKEN or BOT_TOKEN == 'YOUR_BOT_TOKEN_HERE':
        logger.error("❌ Please set BOT_TOKEN!")
        return
    
    try:
        bot.run(BOT_TOKEN)
    except Exception as e:
        logger.error(f"❌ Error: {e}")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n🛑 Bot stopped")
        sys.exit(0)
    except Exception as e:
        logger.error(f"❌ Fatal: {e}")
        sys.exit(1)
