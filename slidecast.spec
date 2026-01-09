# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['backend/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('backend/client', 'client'),
        ('backend/.env', '.')
    ],
    hiddenimports=[
        'uvicorn', 
        'fastapi', 
        'pydub', 
        'faster_whisper', 
        'python_multipart',
        'engineio.async_drivers.asciivents', # sometimes needed for uvicorn
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'torch', 
        'torchaudio', 
        'torchvision', 
        'pandas', 
        'scipy', 
        'matplotlib', 
        'tkinter', 
        'IPython', 
        'notebook',
        'unittest',
        'http.server',
        'xml.dom.domreg',
        'pydoc',
        'pdb',
        'difflib'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='slidecast',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True, 
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='slidecast',
)
