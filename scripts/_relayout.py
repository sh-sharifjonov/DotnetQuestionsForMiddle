import sys, glob, re
# usage: caption|newdir|subdir(optional)
specs = [l.split('|') for l in sys.stdin.read().strip().splitlines()]
for f in glob.glob('content/*/*.md'):
    s = open(f).read(); orig = s
    for spec in specs:
        cap, newdir = spec[0], spec[1]
        sub = spec[2] if len(spec) > 2 else None
        key = '```mermaid ' + cap + '\n'
        i = s.find(key)
        if i < 0: continue
        j = s.index('```', i + len(key))
        block = s[i:j]
        block = re.sub(r'^(flowchart|graph) \w+', r'\1 ' + newdir, block[len(key):], count=1, flags=re.M)
        if sub: block = re.sub(r'direction \w+', 'direction ' + sub, block)
        s = s[:i] + key + block + s[j:]
        print('fixed', cap)
    if s != orig: open(f, 'w').write(s)
