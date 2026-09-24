# Nakładka zgodności dla `nix-shell` bez włączonych flake'ów.
# Bierze nixpkgs z kanału systemowego, więc jest mniej odtwarzalna niż flake —
# i dlatego CI oraz zalecana praca lokalna idą przez `nix develop`.
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [ pkgs.nodejs_22 pkgs.gnumake ];
}
