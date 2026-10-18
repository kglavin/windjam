"""Shared drawing for the level 12 videos: the example mesh from videos/data/level12-<id>.json."""
from common import *  # noqa: F403


def mesh_parts(D, V, colors=None, square_gateway=True):
    """Links and nodes of the example mesh; colors maps a node index to a colour."""
    colors = colors or {}
    N = D["nodes"]
    links = {(a, b): V.link(N[a], N[b]) for a, b in D["links"]}
    nodes = [V.node(N[i], D["names"][i], colors.get(i, WHITE if i == D["gateway"] else GREEN_C3), square=square_gateway and i == D["gateway"])
             for i in range(len(N))]
    return links, nodes


def link_of(links, a, b):
    return links[(min(a, b), max(a, b))]
