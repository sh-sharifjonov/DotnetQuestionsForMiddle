import sys, glob
caps = [l for l in sys.stdin.read().strip().splitlines()]
for f in glob.glob('content/*/*.md'):
    s = open(f).read(); orig = s
    for cap in caps:
        key = '```mermaid ' + cap + '\n'
        i = s.find(key)
        if i < 0: continue
        j = s.index('```', i + len(key))
        lines = s[i+len(key):j].split('\n')
        segs, slots, k = [], [], 0
        out = []
        while k < len(lines):
            if lines[k].startswith('    subgraph'):
                st = k
                while lines[k] != '    end': k += 1
                segs.append(lines[st:k+1]); out.append(None)
            else:
                out.append(lines[k])
            k += 1
        segs.reverse(); it = iter(segs); res = []
        for o in out:
            res.extend(next(it) if o is None else [o])
        s = s[:i+len(key)] + '\n'.join(res) + s[j:]
        print('reversed', cap, f)
    if s != orig: open(f, 'w').write(s)
