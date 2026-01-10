import os
import shutil
import subprocess
import sys

def run_command(command, cwd=None):
    print(f"Running: {command}")
    subprocess.check_call(command, shell=True, cwd=cwd)

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")
    backend_dir = os.path.join(base_dir, "backend")
    client_dest = os.path.join(backend_dir, "client")

    print(f"Base Dir: {base_dir}")

    # 1. Build Frontend
    print("\n--- 1. Building Frontend ---")
    try:
        if not os.path.exists(os.path.join(frontend_dir, "node_modules")):
            print("node_modules not found, running npm install...")
            subprocess.run("npm install", shell=True, cwd=frontend_dir, check=True)
        
        print("Running npm run build...")
        subprocess.run("npm run build", shell=True, cwd=frontend_dir, check=False)
    except Exception as e:
        print(f"Frontend build warning: {e}")
        print("Continuing... assuming dist/ exists from previous run.")

    # 2. Copy to Backend
    print("\n--- 2. Copying Frontend to Backend ---")
    if os.path.exists(client_dest):
        print(f"Removing existing client dir: {client_dest}")
        shutil.rmtree(client_dest)
    
    src_dist = os.path.join(frontend_dir, "dist")
    print(f"Copying {src_dist} -> {client_dest}")
    shutil.copytree(src_dist, client_dest)

    # 2.5 Check for FFMPEG
    print("\n--- 2.5 Checking for FFMPEG ---")
    ffmpeg_exe = "ffmpeg.exe"
    if os.path.exists(ffmpeg_exe):
        print(f"Found {ffmpeg_exe}, copying to client dir to be bundled...")
        # Actually, PyInstaller --onedir means we should copy it to the DIST folder after build
        # OR add it to datas in spec. simpler to copy to dist after build.
        pass
    else:
        print("WARNING: ffmpeg.exe not found in project root.")
        print("The application requires FFMPEG to process audio.")
        print("Please download ffmpeg.exe and place it in this folder before building, or in the install directory.")

    # 3. PyInstaller
    print("\n--- 3. Running PyInstaller ---")
    # Clean output dirs
    if os.path.exists("build"): shutil.rmtree("build")
    if os.path.exists("dist"): shutil.rmtree("dist")
    
    run_command(f"\"{sys.executable}\" -m PyInstaller slidecast.spec", cwd=base_dir)

    # 4. Post-Build: Copy FFMPEG if present
    if os.path.exists(ffmpeg_exe):
        dist_dir = os.path.join("dist", "slidecast")
        print(f"Copying ffmpeg.exe to {dist_dir}...")
        shutil.copy(ffmpeg_exe, dist_dir)


    print("\n--- Build Complete ---")
    print("The executables are in 'dist/slidecast/'")
    
    # 4. Inno Setup Check
    print("\n--- 4. Checking for Inno Setup ---")
    try:
        subprocess.check_call("iscc /?", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Inno Setup (ISCC) found. You can run 'iscc setup.iss' to create the installer.")
    except:
        print("Inno Setup Compiler (ISCC) not found in PATH.")
        print("Please install Inno Setup and add it to PATH, or compile 'setup.iss' manually.")

if __name__ == "__main__":
    main()
