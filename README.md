# RenderQ
![renderq](https://user-images.githubusercontent.com/73527278/123974783-ceb15180-d9b4-11eb-8c69-ce7cbd3c8dd3.PNG)

A render management / queue utility that can render Nuke Scripts and Blender Scenes sequentially.

## How to use

Once installed, launcing the application will bring you to the main interface.

Clicking on *add file* will allow you to select nuke scripts or blender scenes,
once your list is ready you may save or load your list to / from a text file, or just hit *Render Jobs* to start rendering

Also you will need to specify the application paths and filenames for your installations of Nuke and Blender, found at the bottom left of the window.

## Improving the app

This app was written during a vfx project requiring about 260 shots to be rendered without a dedicated render farm on a single workstation.
Whilst it's been production proven to be stable-ish there are probably a few problems, so feel free to improve upon the source code within this repository

This application has been written in visual studio community edition 2019 using WPF and VB.NET
