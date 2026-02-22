function myersDiff(oldLines, newLines) {
    const N = oldLines.length, M = newLines.length;
    const MAX = N + M;
    if (MAX === 0) return [];
    if (oldLines.join('\n') === newLines.join('\n')) {
        return oldLines.map((t, i) => ({ op: 'equal', oldLine: i + 1, newLine: i + 1, text: t }));
    }
    const trace = [];
    const V = new Map([[1, 0]]);
    outer:
    for (let d = 0; d <= MAX; d++) {
        const Vcopy = new Map(V);
        trace.push(Vcopy);

        for (let k = -d; k <= d; k += 2) {
            let x;
            const downVal = V.get(k - 1) ?? -1;
            const rightVal = V.get(k + 1) ?? -1;

            if (k === -d || (k !== d && downVal < rightVal)) {
                x = rightVal + 1;
            } else {
                x = downVal;
            }

            let y = x - k;
            while (x < N && y < M && oldLines[x] === newLines[y]) { x++; y++; }

            V.set(k, x);
            if (x >= N && y >= M) break outer;
        }
    }

    const edits = [];
    let x = N, y = M;

    for (let d = trace.length - 1; d > 0; d--) {
        const Vprev = trace[d - 1]; // FIX: look at d - 1 !
        const k = x - y;
        const downVal = Vprev.get(k - 1) ?? -1;
        const rightVal = Vprev.get(k + 1) ?? -1;

        let prevK;
        if (k === -d || (k !== d && downVal < rightVal)) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }

        const prevX = Vprev.get(prevK) ?? 0;
        const prevY = prevX - prevK;

        while (x > prevX + 1 && y > prevY + 1) {
            edits.unshift({ op: 'equal', oldLine: x, newLine: y, text: oldLines[x - 1] });
            x--; y--;
        }

        if (x === prevX) {
            edits.unshift({ op: 'insert', newLine: y, text: newLines[y - 1] });
            y--;
        } else {
            edits.unshift({ op: 'delete', oldLine: x, text: oldLines[x - 1] });
            x--;
        }

        while (x > prevX && y > prevY) {
            edits.unshift({ op: 'equal', oldLine: x, newLine: y, text: oldLines[x - 1] });
            x--; y--;
        }
    }
    
    // For d=0, remaining matches must be on the diagonal!
    while (x > 0 && y > 0) {
        edits.unshift({ op: 'equal', oldLine: x, newLine: y, text: oldLines[x - 1] });
        x--; y--;
    }

    return edits;
}

const ed = myersDiff(['a', 'b', 'c'], ['a', 'b', 'x', 'd']);
console.log(ed);
