# This script splits a folder of files into 10 subfolders.
i=0;
for f in *;
do
    d=dir_$(printf %03d $((i/10+1)));
    mkdir -p $d;
    mv "$f" $d;
    let i++;
done
